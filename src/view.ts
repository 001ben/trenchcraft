import * as T from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { BucketSoil } from "./bucket-soil";
import { LandSurface } from "./land-surface";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { Hydraulics } from "./hydraulics";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { Simulation, NX, NZ, cellPosition, tooth, ARM } from "./simulation";
import { CLOD_RADIUS, CLOD_VOLUME, SOIL } from "./soil";
import type { SoilClod } from "./simulation";
const material = (color: number) =>
  new T.MeshStandardMaterial({ color, roughness: 0.9 });
/** A lumpy sphere so clods read as clumps of earth rather than marbles. */
function clodGeometry() {
  const g = new T.IcosahedronGeometry(1, 1),
    pos = g.attributes.position as T.BufferAttribute,
    seen = new Map<string, number>();
  let seed = 3;
  for (let i = 0; i < pos.count; i++) {
    const key = [pos.getX(i), pos.getY(i), pos.getZ(i)]
      .map((v) => v.toFixed(4))
      .join(",");
    let k = seen.get(key);
    if (k === undefined) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      k = 0.8 + (seed / 4294967296) * 0.36;
      seen.set(key, k);
    }
    pos.setXYZ(i, pos.getX(i) * k, pos.getY(i) * k * 0.85, pos.getZ(i) * k);
  }
  g.computeVertexNormals();
  return g;
}
export class View {
  renderer: T.WebGLRenderer;
  scene = new T.Scene();
  camera = new T.PerspectiveCamera(44, 1, 0.1, 120);
  model = new T.Group();
  cab = false;
  overview = false;
  private lastCameraMode = "";
  private cameraTarget = new T.Vector3();
  terrain: LandSurface;
  private grassBlades: T.InstancedMesh;
  private temp = new T.Object3D();
  private parts = new Map<string, T.Object3D>();
  private particles: {
    position: T.Vector3;
    velocity: T.Vector3;
    life: number;
  }[] = [];
  private dustMesh = new T.InstancedMesh(
    new T.IcosahedronGeometry(0.065, 1),
    material(0x845736),
    36,
  );
  private grassCells = new Map<number, number>();
  private track: T.InstancedMesh;
  private trackPhase = [0, 0];
  private lastHeading = 0;
  private hydraulics?: Hydraulics;
  bucketSoil?: BucketSoil;
  /** Every physical clod, carried or loose, in one instanced draw. */
  /** Same colour as freshly cut ground in the land surface, so earth never changes hue. */
  private clods = new T.InstancedMesh(
    clodGeometry(),
    new T.MeshStandardMaterial({
      color: new T.Color().setHSL(0.075, 0.39, 0.245),
      roughness: 1,
    }),
    SOIL.capacity,
  );
  private clodSeeds = new WeakMap<SoilClod, number>();
  private clodSeed = 0;
  private cursor = new T.Mesh(
    new T.RingGeometry(0.36, 0.41, 24),
    new T.MeshBasicMaterial({
      color: 0xfff1b6,
      side: T.DoubleSide,
      transparent: true,
      opacity: 0.85,
      depthTest: false,
      depthWrite: false,
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
    this.renderer.toneMappingExposure = 1.05;
    const room = new RoomEnvironment();
    const pmrem = new T.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(room, 0.04).texture;
    this.scene.environmentIntensity = 0.4;
    room.dispose();
    pmrem.dispose();
    this.scene.fog = new T.Fog(0xc5d8c6, 28, 62);
    this.scene.add(new T.HemisphereLight(0xe6f4ec, 0x857044, 1.8));
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
    this.terrain = new LandSurface(sim);
    this.scene.add(this.terrain);
    for (const mesh of [this.clods, this.dustMesh])
      mesh.material.map = this.terrain.material.map;
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
    for (let i = 0; i < NX * NZ; i++) {
      const v = Math.sin(i * 127.1) * 43758.5453;
      if (v - Math.floor(v) < 0.085)
        this.grassCells.set(i, this.grassCells.size);
    }
    this.grassBlades = new T.InstancedMesh(
      bladeGeometry,
      bladeMaterial,
      this.grassCells.size,
    );
    this.scene.add(this.grassBlades);
    for (let i = 0; i < NX * NZ; i++) this.updateCell(i);
    this.terrain.flush();
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
    const shoe = new T.BoxGeometry(0.44, 0.055, 0.14);
    const ribs = [-1, 1].map((side) => {
      const rib = new T.BoxGeometry(0.21, 0.035, 0.045);
      rib.rotateY(side * 0.28);
      rib.translate(side * 0.1, 0.036, 0);
      return rib;
    });
    const treadGeometry = mergeGeometries([shoe, ...ribs]);
    for (const geometry of [shoe, ...ribs]) geometry.dispose();
    this.track = new T.InstancedMesh(treadGeometry, material(0x242927), 72);
    this.track.castShadow = true;
    this.model.add(this.track);
    this.scene.add(this.model, this.clods, this.dustMesh);
    this.dustMesh.count = 0;
    this.dustMesh.frustumCulled = false;
    this.clods.castShadow = true;
    this.clods.receiveShadow = true;
    this.clods.count = 0;
    this.clods.instanceMatrix.setUsage(T.DynamicDrawUsage);
    // Clods move independently; the initial empty instance bounds do not describe them.
    this.clods.frustumCulled = false;
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
    this.bucketSoil = new BucketSoil(this.terrain.material.map);
    this.parts.get("Bucket")!.add(this.bucketSoil);
    this.hydraulics = new Hydraulics(this.scene, this.model);
    this.render(0, 0);
  }
  resize() {
    this.camera.aspect = innerWidth / innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(innerWidth, innerHeight);
  }
  reset(sim: Simulation) {
    this.sim = sim;
    this.terrain.setSimulation(sim);
    this.particles.length = 0;
    this.model.userData.lastPosition = undefined;
    this.lastHeading = sim.machine.heading;
    this.trackPhase.fill(0);
    this.lastCameraMode = "";
    for (let i = 0; i < sim.ground.length; i++) sim.changed.add(i);
  }
  updateCell(i: number) {
    const p = cellPosition(i),
      h = this.sim.ground[i];
    this.terrain.markCell(i);
    const grassIndex = this.grassCells.get(i);
    if (grassIndex === undefined) return;
    const lawn = this.terrain.isGrass(i);
    const scatter = Math.sin(i * 127.1) * 43758.5453;
    const noise = scatter - Math.floor(scatter);
    this.temp.position.set(
      p.x + (noise - 0.5) * 0.17,
      h + 0.009,
      p.z + Math.sin(i) * 0.07,
    );
    this.temp.rotation.set(0, i * 2.4, 0);
    this.temp.scale.setScalar(lawn ? 0.45 + noise * 4 : 0);
    this.temp.updateMatrix();
    this.grassBlades.setMatrixAt(grassIndex, this.temp.matrix);
  }
  /** Fixed per-clod tumble so a resting heap does not shimmer. */
  private seedOf(clod: SoilClod) {
    let seed = this.clodSeeds.get(clod);
    if (seed === undefined) {
      seed = (this.clodSeed++ * 0.61803398875) % 1;
      this.clodSeeds.set(clod, seed);
    }
    return seed;
  }
  render(dt: number, time: number) {
    // Tools and old saves set the load directly; show it as clods resting in the bowl.
    this.sim.reconcileLoad();
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
    const inside = this.parts.get("Interior");
    if (inside) inside.visible = !this.cab;
    this.scene.updateMatrixWorld(true);
    this.bucketSoil?.update(this.sim, dt);
    this.hydraulics?.update();
    for (const i of this.sim.changed) this.updateCell(i);
    if (this.sim.changed.size) {
      this.terrain.flush();
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
      this.trackPhase[0] -= distance - turn * 0.79;
      this.trackPhase[1] -= distance + turn * 0.79;
    }
    this.lastHeading = m.heading;
    this.model.userData.lastPosition = new T.Vector3(m.x, 0, m.z);
    const straight = 1.6,
      r = 0.32,
      length = 2 * straight + 2 * Math.PI * r;
    for (let side = 0; side < 2; side++)
      for (let i = 0; i < 36; i++) {
        const q =
          ((((i * length) / 36 + this.trackPhase[side]) % length) + length) %
          length;
        let z: number, y: number, a: number;
        if (q < straight) {
          z = -straight / 2 + q;
          y = 0.34 + r;
          a = 0;
        } else if (q < straight + Math.PI * r) {
          a = (q - straight) / r;
          z = straight / 2 + r * Math.sin(a);
          y = 0.34 + r * Math.cos(a);
        } else if (q < 2 * straight + Math.PI * r) {
          z = straight / 2 - (q - straight - Math.PI * r);
          y = 0.34 - r;
          a = Math.PI;
        } else {
          a = (q - 2 * straight - Math.PI * r) / r + Math.PI;
          z = -straight / 2 + r * Math.sin(a);
          y = 0.34 + r * Math.cos(a);
        }
        this.temp.position.set(side ? 0.79 : -0.79, y, z);
        this.temp.rotation.set(a, 0, 0);
        this.temp.scale.set(1, 1, 1);
        this.temp.updateMatrix();
        this.track.setMatrixAt(side * 36 + i, this.temp.matrix);
      }
    this.track.instanceMatrix.needsUpdate = true;
    const tip = tooth(m);
    const grade = this.sim.grade(tip.x, tip.z);
    this.cursor.material.color.setHex(
      grade.state === "on-grade" ? 0x36d699 :
      grade.state === "too-deep" ? 0xff7660 : 0xffd16a,
    );
    this.cursor.position.set(
      tip.x,
      this.sim.surface(tip.x, tip.z) + 0.035,
      tip.z,
    );
    this.cursor.visible =
      !this.overview && grade.state !== "off-line";
    let count = 0;
    for (const list of [this.sim.held, this.sim.falling])
      for (const p of list) {
        if (count >= SOIL.capacity) break;
        const seed = this.seedOf(p);
        this.temp.position.set(p.x, p.y, p.z);
        this.temp.rotation.set(seed * 6.28, seed * 40, seed * 17);
        const size = CLOD_RADIUS * 1.3 * Math.cbrt(p.volume / CLOD_VOLUME),
          s2 = (seed * 7.31) % 1,
          s3 = (seed * 3.7) % 1;
        this.temp.scale.set(
          size * (0.8 + seed * 0.45),
          size * (0.7 + s2 * 0.4),
          size * (0.8 + s3 * 0.45),
        );
        this.temp.updateMatrix();
        this.clods.setMatrixAt(count++, this.temp.matrix);
      }
    this.clods.count = count;
    this.clods.instanceMatrix.needsUpdate = true;
    void time;
    for (const p of this.sim.dust.splice(0))
      if (this.particles.length < 36) {
        const position = new T.Vector3(p.x, p.y + 0.12, p.z);
        this.particles.push({
          position,
          velocity: new T.Vector3(
            (Math.random() - 0.5) * 1.2,
            p.dump ? -1 : 0.8,
            (Math.random() - 0.5) * 1.2,
          ),
          life: p.dump ? 0.45 : 0.32,
        });
      }
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= dt;
      p.velocity.y -= dt * 5;
      p.position.addScaledVector(p.velocity, dt);
      if (p.life <= 0) {
        this.particles.splice(i, 1);
      }
    }
    this.dustMesh.count = this.particles.length;
    for (let i = 0; i < this.particles.length; i++) {
      this.temp.position.copy(this.particles[i].position);
      this.temp.rotation.set(i, i * 0.7, time);
      this.temp.scale.set(0.8, 0.65, 1);
      this.temp.updateMatrix();
      this.dustMesh.setMatrixAt(i, this.temp.matrix);
    }
    this.dustMesh.instanceMatrix.needsUpdate = true;
    const yaw = m.heading + m.swing,
      f = new T.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw)),
      right = new T.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
    let eye = new T.Vector3(m.x, 0, m.z),
      look = eye.clone();
    if (this.overview) {
      eye.set(11, 18, 15);
      look.set(0, 0, -2);
    } else if (this.cab) {
      eye.addScaledVector(right, -0.44).addScaledVector(f, 0.3);
      eye.y = 2.17;
      look.copy(eye).addScaledVector(f, 7);
      look.y = 0.5;
    } else {
      eye
        .addScaledVector(f, -(innerWidth < 600 ? 10.5 : 9))
        .addScaledVector(right, innerWidth < 600 ? 4.8 : 3.7);
      eye.y = innerWidth < 600 ? 10 : 7;
      look.addScaledVector(f, 2.6);
      look.y = 0.1;
    }
    const fov = this.cab && !this.overview ? 72 : 44;
    if (this.camera.fov !== fov) {
      this.camera.fov = fov;
      this.camera.updateProjectionMatrix();
    }
    const mode = this.overview ? "overview" : this.cab ? "cab" : "chase";
    // Cut between cameras instead of flying through the cab and boom. While
    // following, ease the target along with the eye so the view does not lurch.
    const blend =
      mode !== this.lastCameraMode || !dt ? 1 : 1 - Math.exp(-dt * 7);
    this.camera.position.lerp(eye, blend);
    this.cameraTarget.lerp(look, blend);
    this.lastCameraMode = mode;
    this.camera.lookAt(this.cameraTarget);
    this.renderer.render(this.scene, this.camera);
  }
}
