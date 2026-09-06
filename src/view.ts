import * as T from "three";
import { Hydraulics } from "./hydraulics";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import {
  Simulation,
  CELL,
  NX,
  NZ,
  cellPosition,
  spoil,
  target,
  tooth,
  CAPACITY,
  ARM,
} from "./simulation";
const material = (color: number) =>
  new T.MeshStandardMaterial({ color, roughness: 0.9 });
export class View {
  renderer: T.WebGLRenderer;
  scene = new T.Scene();
  camera = new T.PerspectiveCamera(44, 1, 0.1, 120);
  model = new T.Group();
  cab = false;
  overview = false;
  terrain: T.InstancedMesh;
  turf: T.InstancedMesh;
  private grassBlades: T.InstancedMesh;
  private temp = new T.Object3D();
  private color = new T.Color();
  private parts = new Map<string, T.Object3D>();
  private particles: {
    mesh: T.Mesh;
    velocity: T.Vector3;
    life: number;
    start?: T.Vector3;
  }[] = [];
  private dirt = material(0x845736);
  private track: T.InstancedMesh;
  private trackPhase = [0, 0];
  private lastHeading = 0;
  private hydraulics?: Hydraulics;
  private heap = new T.Mesh(
    new T.SphereGeometry(1, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2),
    material(0x67402a),
  );
  private lumps = new T.InstancedMesh(
    new T.IcosahedronGeometry(1, 0),
    material(0x845333),
    16,
  );
  private fallingSoil = new T.InstancedMesh(
    new T.IcosahedronGeometry(1, 0),
    material(0x795033),
    64,
  );
  private cursor = new T.Mesh(
    new T.RingGeometry(0.36, 0.41, 24),
    new T.MeshBasicMaterial({
      color: 0xfff1b6,
      side: T.DoubleSide,
      transparent: true,
      opacity: 0.85,
    }),
  );
  constructor(
    canvas: HTMLCanvasElement,
    public sim: Simulation,
  ) {
    this.renderer = new T.WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: "high-performance",
    });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.6));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = T.PCFSoftShadowMap;
    this.renderer.setClearColor(0xc5d8c6);
    this.renderer.toneMapping = T.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.3;
    this.scene.fog = new T.Fog(0xc5d8c6, 28, 62);
    this.scene.add(new T.HemisphereLight(0xe6f4ec, 0x857044, 2.6));
    const sun = new T.DirectionalLight(0xffe5b2, 3.4);
    sun.position.set(-8, 16, 8);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    Object.assign(sun.shadow.camera, {
      left: -15,
      right: 15,
      top: 15,
      bottom: -15,
      near: 0.5,
      far: 50,
    });
    sun.shadow.bias = -0.001;
    sun.shadow.normalBias = 0.035;
    this.scene.add(sun);
    this.terrain = new T.InstancedMesh(
      new T.BoxGeometry(CELL, 1, CELL),
      material(0xffffff),
      NX * NZ,
    );
    this.terrain.receiveShadow = true;
    this.scene.add(this.terrain);
    this.turf = new T.InstancedMesh(
      new T.PlaneGeometry(CELL, CELL),
      material(0xffffff),
      NX * NZ,
    );
    this.turf.receiveShadow = true;
    this.scene.add(this.turf);
    const bladeGeometry = new T.BufferGeometry();
    bladeGeometry.setAttribute(
      "position",
      new T.Float32BufferAttribute(
        [
          -0.065, 0, 0, -0.02, 0.17, 0, 0.025, 0, 0, 0, 0, -0.045, 0, 0.12,
          0.025, 0, 0, 0.065, -0.03, 0, 0.02, 0.065, 0.11, 0.02, 0.055, 0, 0.02,
        ],
        3,
      ),
    );
    bladeGeometry.computeVertexNormals();
    const bladeMaterial = material(0x527338);
    bladeMaterial.side = T.DoubleSide;
    this.grassBlades = new T.InstancedMesh(
      bladeGeometry,
      bladeMaterial,
      NX * NZ,
    );
    this.scene.add(this.grassBlades);
    for (let i = 0; i < NX * NZ; i++) this.updateCell(i);
    const base = this.box(0, -2.1, 0, 18, 1, 20, 0x956144);
    base.receiveShadow = true;
    this.box(0, -2.75, 0, 18.1, 0.3, 20.1, 0x6b6555);
    const grass = this.box(0, -3, 0, 180, 0.15, 180, 0x9eb38a);
    grass.receiveShadow = true;
    const chalk = 0xfff3cf;
    for (let z = -2; z >= -8; z -= 0.5) {
      this.box(-0.55, 0.025, z, 0.035, 0.025, 0.28, chalk);
      this.box(0.55, 0.025, z, 0.035, 0.025, 0.28, chalk);
    }
    for (let z = -1.5; z >= -8.5; z -= 0.65) {
      this.box(2.5, 0.025, z, 0.035, 0.025, 0.3, 0xeab763);
      this.box(5, 0.025, z, 0.035, 0.025, 0.3, 0xeab763);
    }
    for (const z of [-2, -8])
      for (const x of [-0.7, 0.7]) {
        this.box(x, 0.2, z, 0.055, 0.4, 0.055, 0xf8ead3);
        this.box(x, 0.38, z, 0.18, 0.14, 0.04, 0xc8754b);
      }
    for (let z = -9; z < 10; z += 1.8)
      for (const x of [-8.65, 8.65]) {
        this.box(x, 0.45, z, 0.13, 0.9, 0.13, 0xebe5cb);
        if (z < 8.5)
          for (const y of [0.32, 0.7])
            this.box(x, y, z + 0.8, 0.065, 0.08, 1.7, 0xe5dec1);
      }
    for (let i = 0; i < 8; i++) {
      const x = (i % 2 ? 1 : -1) * 7.4,
        z = -7.2 + Math.floor(i / 2) * 4.6;
      this.tree(x, z, 0.7 + (i % 3) * 0.13);
    }
    for (const z of [-9.55, 9.55])
      for (let x = -8.6; x < 8.6; x += 1.8) {
        if (z > 0 && Math.abs(x) < 2) continue;
        this.box(x, 0.45, z, 0.13, 0.9, 0.13, 0xebe5cb);
        if (x < 7)
          for (const y of [0.32, 0.7])
            this.box(x + 0.8, y, z, 1.7, 0.08, 0.065, 0xe5dec1);
      }
    // A small potting area and stepping stones make this a backyard parcel.
    for (let i = 0; i < 5; i++)
      this.box(-5.3, 0.025, -6.2 + i * 0.55, 0.7, 0.05, 0.39, 0xbbba9c);
    for (let i = 0; i < 3; i++) {
      const bush = new T.Mesh(
        new T.IcosahedronGeometry(0.45, 0),
        material(0x66843e),
      );
      bush.position.set(-3.5 + i * 0.6, 0.4, -8.6);
      bush.castShadow = true;
      this.scene.add(bush);
    }
    this.box(-5.3, 0.7, -7.9, 2.6, 1.4, 2.7, 0xe4cba7);
    const roof = this.box(-5.3, 1.57, -7.9, 3, 0.2, 3.05, 0x647e71);
    roof.rotation.z = 0.05;
    this.box(-5.3, 0.6, -6.52, 0.62, 1.2, 0.04, 0x496b62);
    this.box(-4.6, 0.85, -6.49, 0.5, 0.45, 0.04, 0x89b0ae);
    for (let i = 0; i < 3; i++) {
      const pipe = new T.Mesh(
        new T.CylinderGeometry(0.17, 0.17, 1.8, 12, 1, true),
        material(0x6c9aa1),
      );
      pipe.rotation.z = Math.PI / 2;
      pipe.position.set(-4.5, 0.2 + i * 0.25, -4.8);
      this.scene.add(pipe);
    }
    this.label("SERVICE TRENCH", 0, 0.04, -8.7, 2.5);
    this.label("SPOIL HERE", 3.75, 0.04, -9.2, 2.1);
    this.track = new T.InstancedMesh(
      new T.BoxGeometry(0.58, 0.08, 0.17),
      material(0x263d37),
      72,
    );
    this.track.castShadow = true;
    this.model.add(this.track);
    this.scene.add(this.model, this.fallingSoil);
    this.fallingSoil.castShadow = true;
    this.fallingSoil.count = 0;
    // Clods move independently; the initial empty instance bounds do not describe them.
    this.fallingSoil.frustumCulled = false;
    this.cursor.rotation.x = -Math.PI / 2;
    this.scene.add(this.cursor);
    window.addEventListener("resize", () => this.resize());
    this.resize();
  }
  private box(
    x: number,
    y: number,
    z: number,
    w: number,
    h: number,
    d: number,
    color: number,
  ) {
    const m = new T.Mesh(new T.BoxGeometry(w, h, d), material(color));
    m.position.set(x, y, z);
    m.castShadow = true;
    m.receiveShadow = true;
    this.scene.add(m);
    return m;
  }
  private tree(x: number, z: number, s: number) {
    this.box(x, 0.8, z, 0.23, 1.6, 0.23, 0x8b7054);
    for (let i = 0; i < 2; i++) {
      const m = new T.Mesh(
        new T.IcosahedronGeometry(s, 0),
        material(i ? 0x718c67 : 0x829d70),
      );
      m.position.set(x + (i ? 0.35 : 0), 1.8 + i * 0.45, z);
      m.castShadow = true;
      this.scene.add(m);
    }
  }
  private label(text: string, x: number, y: number, z: number, width: number) {
    const canvas = document.createElement("canvas");
    canvas.width = 512;
    canvas.height = 80;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#fff4cd";
    ctx.font = "bold 34px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(text, 256, 54);
    const mesh = new T.Mesh(
      new T.PlaneGeometry(width, (width * 80) / 512),
      new T.MeshBasicMaterial({
        map: new T.CanvasTexture(canvas),
        transparent: true,
        depthWrite: false,
      }),
    );
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(x, y, z);
    this.scene.add(mesh);
  }
  async load() {
    const gltf = await new GLTFLoader().loadAsync(
      import.meta.env.BASE_URL + "models/mini-excavator.glb",
    );
    gltf.scene.traverse((o) => {
      this.parts.set(o.name, o);
      if (o instanceof T.Mesh) {
        o.castShadow = true;
        o.receiveShadow = true;
      }
    });
    this.model.add(gltf.scene);
    const fill = this.parts.get("BucketFill")!;
    this.heap.name = "VisibleSoilHeap";
    fill.add(this.heap, this.lumps);
    this.heap.castShadow = true;
    this.lumps.castShadow = true;
    this.hydraulics = new Hydraulics(this.scene, this.model);
    this.render(0, 0);
  }
  resize() {
    this.camera.aspect = innerWidth / innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(innerWidth, innerHeight);
  }
  updateCell(i: number) {
    const p = cellPosition(i),
      h = this.sim.ground[i];
    this.temp.position.set(p.x, (h - 2) / 2, p.z);
    this.temp.scale.set(1, 2 + h, 1);
    this.temp.rotation.set(0, 0, 0);
    this.temp.updateMatrix();
    this.terrain.setMatrixAt(i, this.temp.matrix);
    const variation = ((i * 17) % 13) / 450;
    this.color.setHSL(h < -0.25 ? 0.065 : 0.075, 0.39, 0.25 + variation);
    this.terrain.setColorAt(i, this.color);
    // Turf is a real surface layer: a cut removes it, and backfill stays bare soil.
    const lawn = this.sim.deepest[i] > -0.015 && h >= -0.015 && h < 0.02;
    const yard = !(p.x > -6.8 && p.x < -3.7 && p.z < -6.35 && p.z > -9.35);
    this.temp.position.set(p.x, h + 0.007, p.z);
    this.temp.rotation.set(-Math.PI / 2, 0, 0);
    this.temp.scale.setScalar(lawn && yard ? 1 : 0);
    this.temp.updateMatrix();
    this.turf.setMatrixAt(i, this.temp.matrix);
    const patch = (Math.sin(p.x * 0.73) + Math.cos(p.z * 0.52)) * 0.012;
    this.color.setHSL(0.255 + patch, 0.45, 0.16 + patch + variation * 0.2);
    this.turf.setColorAt(i, this.color);
    const scatter = Math.sin(i * 127.1) * 43758.5453;
    const noise = scatter - Math.floor(scatter);
    this.temp.position.set(
      p.x + (noise - 0.5) * 0.17,
      h + 0.009,
      p.z + Math.sin(i) * 0.07,
    );
    this.temp.rotation.set(0, i * 2.4, 0);
    this.temp.scale.setScalar(
      lawn && yard && noise < 0.085 ? 0.45 + noise * 4 : 0,
    );
    this.temp.updateMatrix();
    this.grassBlades.setMatrixAt(i, this.temp.matrix);
  }
  render(dt: number, time: number) {
    const m = this.sim.machine;
    this.model.position.set(m.x, 0, m.z);
    this.model.rotation.y = m.heading;
    const upper = this.parts.get("Upper");
    if (upper) upper.rotation.y = m.swing;
    for (const [name, angle] of [
      ["Boom", m.boom],
      ["Stick", m.stick],
      ["Bucket", ARM.bucketMount - m.bucket],
    ] as const) {
      const p = this.parts.get(name);
      if (p) p.rotation.x = angle;
    }
    const fill = this.parts.get("BucketFill");
    if (fill) {
      fill.visible = m.load > 0.003;
      const fraction = Math.min(1, m.load / CAPACITY);
      this.heap.position.set(0, -0.09, 0.025);
      this.heap.scale.set(0.32, 0.04 + fraction * 0.24, 0.25);
      for (let i = 0; i < 16; i++) {
        const angle = i * 2.399,
          radial = 0.22 * Math.sqrt(i / 16);
        this.temp.position.set(
          Math.cos(angle) * radial,
          -0.07 + fraction * 0.2,
          Math.sin(angle) * radial + 0.025,
        );
        this.temp.rotation.set(i, i * 0.7, 0);
        this.temp.scale.setScalar(
          fraction > i / 20 ? 0.045 + (i % 3) * 0.015 : 0,
        );
        this.temp.updateMatrix();
        this.lumps.setMatrixAt(i, this.temp.matrix);
      }
      this.lumps.instanceMatrix.needsUpdate = true;
    }
    const inside = this.parts.get("Interior");
    if (inside) inside.visible = !this.cab;
    this.scene.updateMatrixWorld(true);
    this.hydraulics?.update();
    for (const i of this.sim.changed) this.updateCell(i);
    if (this.sim.changed.size) {
      this.terrain.instanceMatrix.needsUpdate = true;
      this.terrain.instanceColor!.needsUpdate = true;
      this.turf.instanceMatrix.needsUpdate = true;
      this.turf.instanceColor!.needsUpdate = true;
      this.grassBlades.instanceMatrix.needsUpdate = true;
      this.sim.changed.clear();
    }
    // Repeating treads follow actual chassis travel, independent of the upper carriage.
    const travel = this.model.userData.lastPosition as T.Vector3 | undefined;
    if (travel) {
      const distance =
          (m.x - travel.x) * -Math.sin(m.heading) +
          (m.z - travel.z) * -Math.cos(m.heading),
        turn = m.heading - this.lastHeading;
      this.trackPhase[0] -= distance - turn * 0.89;
      this.trackPhase[1] -= distance + turn * 0.89;
    }
    this.lastHeading = m.heading;
    this.model.userData.lastPosition = new T.Vector3(m.x, 0, m.z);
    const straight = 1.9,
      r = 0.38,
      length = 2 * straight + 2 * Math.PI * r;
    for (let side = 0; side < 2; side++)
      for (let i = 0; i < 36; i++) {
        const q =
          ((((i * length) / 36 + this.trackPhase[side]) % length) + length) %
          length;
        let z: number, y: number, a: number;
        if (q < straight) {
          z = -straight / 2 + q;
          y = 0.4 + r;
          a = 0;
        } else if (q < straight + Math.PI * r) {
          a = (q - straight) / r;
          z = straight / 2 + r * Math.sin(a);
          y = 0.4 + r * Math.cos(a);
        } else if (q < 2 * straight + Math.PI * r) {
          z = straight / 2 - (q - straight - Math.PI * r);
          y = 0.4 - r;
          a = Math.PI;
        } else {
          a = (q - 2 * straight - Math.PI * r) / r + Math.PI;
          z = -straight / 2 + r * Math.sin(a);
          y = 0.4 + r * Math.cos(a);
        }
        this.temp.position.set(side ? 0.89 : -0.89, y, z);
        this.temp.rotation.set(a, 0, 0);
        this.temp.scale.set(1, 1, 1);
        this.temp.updateMatrix();
        this.track.setMatrixAt(side * 36 + i, this.temp.matrix);
      }
    this.track.instanceMatrix.needsUpdate = true;
    const tip = tooth(m);
    this.cursor.position.set(
      tip.x,
      this.sim.height(tip.x, tip.z) + 0.035,
      tip.z,
    );
    this.cursor.visible = !this.overview;
    this.fallingSoil.count = this.sim.falling.length;
    this.sim.falling.forEach((p, i) => {
      this.temp.position.set(p.x, p.y, p.z);
      this.temp.rotation.set(time * 3 + i, i * 0.7, time + i);
      this.temp.scale.setScalar(Math.cbrt(p.volume) * 0.75);
      this.temp.updateMatrix();
      this.fallingSoil.setMatrixAt(i, this.temp.matrix);
    });
    this.fallingSoil.instanceMatrix.needsUpdate = true;
    for (const p of this.sim.dust.splice(0))
      if (this.particles.length < 36) {
        const mesh = new T.Mesh(new T.IcosahedronGeometry(0.065, 0), this.dirt);
        mesh.position.set(p.x, p.y + 0.12, p.z);
        this.scene.add(mesh);
        this.particles.push({
          mesh,
          velocity: new T.Vector3(
            (Math.random() - 0.5) * 1.2,
            p.dump ? -1 : 0.8,
            (Math.random() - 0.5) * 1.2,
          ),
          life: p.dump ? 0.45 : 0.32,
          start: p.dump ? undefined : mesh.position.clone(),
        });
      }
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= dt;
      if (p.start && fill) {
        const t = Math.min(1, 1 - p.life / 0.32),
          destination = fill.getWorldPosition(new T.Vector3());
        p.mesh.position.lerpVectors(p.start, destination, t);
        p.mesh.position.y += Math.sin(t * Math.PI) * 0.15;
      } else {
        p.velocity.y -= dt * 5;
        p.mesh.position.addScaledVector(p.velocity, dt);
      }
      if (p.life <= 0) {
        this.scene.remove(p.mesh);
        p.mesh.geometry.dispose();
        this.particles.splice(i, 1);
      }
    }
    const yaw = m.heading + m.swing,
      f = new T.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw)),
      right = new T.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
    let eye = new T.Vector3(m.x, 0, m.z),
      look = eye.clone();
    if (this.overview) {
      eye.set(11, 18, 15);
      look.set(0, 0, -2);
    } else if (this.cab) {
      eye.addScaledVector(right, -0.63).addScaledVector(f, 0.3);
      eye.y = 2.02;
      look.copy(eye).addScaledVector(f, 7);
      look.y = 0.5;
    } else {
      eye
        .addScaledVector(f, -(innerWidth < 600 ? 12.5 : 9))
        .addScaledVector(right, innerWidth < 600 ? 1.4 : 3.7);
      eye.y = innerWidth < 600 ? 8.2 : 7;
      look.addScaledVector(f, 2.6);
      look.y = 0.1;
    }
    const fov = this.cab && !this.overview ? 72 : 44;
    if (this.camera.fov !== fov) {
      this.camera.fov = fov;
      this.camera.updateProjectionMatrix();
    }
    this.camera.position.lerp(eye, dt ? 1 - Math.exp(-dt * 7) : 1);
    this.camera.lookAt(look);
    this.renderer.render(this.scene, this.camera);
  }
  minimap(canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext("2d")!,
      w = canvas.width,
      h = canvas.height;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = "#d7cfac";
    ctx.fillRect(0, 0, w, h);
    const sx = w / (NX * CELL),
      sz = h / (NZ * CELL);
    for (let i = 0; i < NX * NZ; i++) {
      const p = cellPosition(i);
      if (
        target(p.x, p.z) ||
        this.sim.ground[i] < -0.05 ||
        this.sim.ground[i] > 0.05 ||
        spoil(p.x, p.z)
      ) {
        ctx.fillStyle =
          this.sim.ground[i] < -0.05
            ? "#5c796b"
            : this.sim.ground[i] > 0.05
              ? "#a76f45"
              : target(p.x, p.z)
                ? "#fff8df"
                : "#d9a761";
        ctx.fillRect(
          (p.x + 9) * sx,
          (p.z + 10) * sz,
          Math.ceil(CELL * sx),
          Math.ceil(CELL * sz),
        );
      }
    }
    const m = this.sim.machine;
    ctx.save();
    ctx.translate((m.x + 9) * sx, (m.z + 10) * sz);
    ctx.rotate(-m.heading - m.swing);
    ctx.fillStyle = "#263f35";
    ctx.beginPath();
    ctx.moveTo(0, -7);
    ctx.lineTo(-5, 5);
    ctx.lineTo(5, 5);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
}
