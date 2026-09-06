import * as T from "three";
import { CELL, NX, NZ, Simulation, cellPosition } from "./simulation";

const CORNERS = (NX + 1) * (NZ + 1);

function uploadChanged(attribute: T.BufferAttribute, vertices: number[]) {
  attribute.clearUpdateRanges();
  let first = vertices[0],
    last = first;
  for (const v of vertices) {
    if (v > last + 8) {
      attribute.addUpdateRange(first * 3, (last - first + 1) * 3);
      first = v;
    }
    last = v;
  }
  attribute.addUpdateRange(first * 3, (last - first + 1) * 3);
  attribute.needsUpdate = true;
}

/** Shared corner heights soften the 25 cm simulation grid without changing saved soil. */
export class LandSurface extends T.Mesh<
  T.BufferGeometry,
  T.MeshStandardMaterial
> {
  private positions: T.BufferAttribute;
  private colors: T.BufferAttribute;
  private normals: T.BufferAttribute;
  private faces: number[][];
  private indices: number[] = [];
  private skirt = new Map<number, number>();
  private dirty = new Set<number>();
  private normalDirty = new Set<number>();
  private color = new T.Color();
  private edgeA = new T.Vector3();
  private edgeB = new T.Vector3();
  private cross = new T.Vector3();
  private origin = new T.Vector3();

  constructor(private sim: Simulation) {
    super(
      new T.BufferGeometry(),
      new T.MeshStandardMaterial({ vertexColors: true, roughness: 1 }),
    );
    const vertices: number[] = [];
    for (let z = 0; z <= NZ; z++)
      for (let x = 0; x <= NX; x++) {
        // Tiny, fixed offsets break perfectly square cut edges; cell centers stay exact.
        const i = z * (NX + 1) + x,
          edge = x === 0 || z === 0 || x === NX || z === NZ;
        vertices.push(
          (x - NX / 2) * CELL + (edge ? 0 : Math.sin(i * 13.7) * 0.025),
          0,
          (z - NZ / 2) * CELL + (edge ? 0 : Math.cos(i * 7.3) * 0.025),
        );
      }
    for (let i = 0; i < NX * NZ; i++) {
      const p = cellPosition(i);
      vertices.push(p.x, 0, p.z);
    }
    for (let z = 0; z < NZ; z++)
      for (let x = 0; x < NX; x++) {
        const a = z * (NX + 1) + x,
          b = a + 1,
          c = a + NX + 1,
          d = c + 1,
          m = CORNERS + z * NX + x;
        this.indices.push(a, m, b, b, m, d, d, m, c, c, m, a);
      }
    // Close the plot edges with a single skirt instead of thousands of buried box faces.
    const border: number[] = [];
    for (let x = 0; x < NX; x++) border.push(x);
    for (let z = 0; z < NZ; z++) border.push(z * (NX + 1) + NX);
    for (let x = NX; x > 0; x--) border.push(NZ * (NX + 1) + x);
    for (let z = NZ; z > 0; z--) border.push(z * (NX + 1));
    for (const top of border) {
      this.skirt.set(top, vertices.length / 3);
      vertices.push(vertices[top * 3], -2, vertices[top * 3 + 2]);
    }
    for (let j = 0; j < border.length; j++) {
      const a = border[j],
        b = border[(j + 1) % border.length],
        c = this.skirt.get(a)!,
        d = this.skirt.get(b)!;
      this.indices.push(a, b, c, b, d, c);
    }
    this.positions = new T.Float32BufferAttribute(vertices, 3).setUsage(
      T.DynamicDrawUsage,
    );
    this.colors = new T.Float32BufferAttribute(
      new Float32Array(vertices.length),
      3,
    ).setUsage(T.DynamicDrawUsage);
    this.normals = new T.Float32BufferAttribute(
      new Float32Array(vertices.length),
      3,
    ).setUsage(T.DynamicDrawUsage);
    this.geometry.setAttribute("position", this.positions);
    this.geometry.setAttribute("color", this.colors);
    this.geometry.setAttribute("normal", this.normals);
    const uv = new Float32Array((vertices.length / 3) * 2);
    for (let i = 0; i < vertices.length / 3; i++) {
      uv[i * 2] = vertices[i * 3] * 0.8;
      uv[i * 2 + 1] = vertices[i * 3 + 2] * 0.8;
    }
    this.geometry.setAttribute("uv", new T.BufferAttribute(uv, 2));
    // One small mipmapped grain texture supplies surface detail without more polygons.
    const grain = new Uint8Array(128 * 128 * 4);
    let seed = 2718;
    for (let i = 0; i < 128 * 128; i++) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      const value = 205 + (seed >>> 27);
      grain.set([value, value, value, 255], i * 4);
    }
    const texture = new T.DataTexture(grain, 128, 128);
    texture.wrapS = texture.wrapT = T.RepeatWrapping;
    texture.magFilter = T.LinearFilter;
    texture.minFilter = T.LinearMipmapLinearFilter;
    texture.generateMipmaps = true;
    texture.colorSpace = T.SRGBColorSpace;
    texture.needsUpdate = true;
    this.material.map = texture;
    this.geometry.setIndex(this.indices);
    this.faces = Array.from({ length: vertices.length / 3 }, () => []);
    for (let f = 0; f < this.indices.length; f += 3)
      for (let k = 0; k < 3; k++) this.faces[this.indices[f + k]].push(f);
    for (let i = 0; i < NX * NZ; i++) this.markCell(i);
    this.flush();
    for (const bottom of this.skirt.values())
      this.colors.setXYZ(bottom, 0.18, 0.1, 0.055);
    this.colors.needsUpdate = true;
    // Fixed conservative bounds cover every legal excavation and spoil height.
    this.geometry.boundingBox = new T.Box3(
      new T.Vector3(-9, -2, -10),
      new T.Vector3(9, 1.8, 10),
    );
    this.geometry.boundingSphere = new T.Sphere(new T.Vector3(0, -0.1, 0), 14);
    this.receiveShadow = true;
  }

  isGrass(i: number) {
    const p = cellPosition(i),
      h = this.sim.ground[i];
    return (
      this.sim.deepest[i] > -0.015 &&
      h >= -0.015 &&
      h < 0.02 &&
      !(p.x > -6.8 && p.x < -3.7 && p.z < -6.35 && p.z > -9.35)
    );
  }
  private cellColor(i: number) {
    const p = cellPosition(i),
      patch = (Math.sin(p.x * 0.73) + Math.cos(p.z * 0.52)) * 0.012;
    if (this.isGrass(i)) this.color.setHSL(0.255 + patch, 0.45, 0.16 + patch);
    else this.color.setHSL(0.075, 0.39, 0.245 + Math.sin(i * 3.1) * 0.007);
    return this.color;
  }
  markCell(i: number) {
    this.dirty.add(CORNERS + i);
    const x = i % NX,
      z = Math.floor(i / NX),
      a = z * (NX + 1) + x;
    for (const v of [a, a + 1, a + NX + 1, a + NX + 2]) this.dirty.add(v);
  }
  flush() {
    if (!this.dirty.size) return;
    for (const v of this.dirty) {
      let h = 0,
        r = 0,
        g = 0,
        b = 0,
        n = 0;
      if (v >= CORNERS) {
        const i = v - CORNERS,
          c = this.cellColor(i);
        h = this.sim.ground[i];
        r = c.r;
        g = c.g;
        b = c.b;
        n = 1;
      } else {
        const x = v % (NX + 1),
          z = Math.floor(v / (NX + 1));
        for (let dz = -1; dz <= 0; dz++)
          for (let dx = -1; dx <= 0; dx++) {
            const cx = x + dx,
              cz = z + dz;
            if (cx < 0 || cz < 0 || cx >= NX || cz >= NZ) continue;
            const i = cz * NX + cx,
              c = this.cellColor(i);
            h += this.sim.ground[i];
            r += c.r;
            g += c.g;
            b += c.b;
            n++;
          }
      }
      this.positions.setY(v, h / n);
      this.colors.setXYZ(v, r / n, g / n, b / n);
      for (const f of this.faces[v])
        for (let k = 0; k < 3; k++) this.normalDirty.add(this.indices[f + k]);
    }
    // Recompute only the faces touching this edit and its shared normals.
    for (const v of this.normalDirty) {
      let nx = 0,
        ny = 0,
        nz = 0;
      for (const f of this.faces[v]) {
        this.origin.fromBufferAttribute(this.positions, this.indices[f]);
        this.edgeA
          .fromBufferAttribute(this.positions, this.indices[f + 1])
          .sub(this.origin);
        this.edgeB
          .fromBufferAttribute(this.positions, this.indices[f + 2])
          .sub(this.origin);
        this.cross.crossVectors(this.edgeA, this.edgeB);
        nx += this.cross.x;
        ny += this.cross.y;
        nz += this.cross.z;
      }
      const length = Math.hypot(nx, ny, nz) || 1;
      this.normals.setXYZ(v, nx / length, ny / length, nz / length);
    }
    const changed = [...this.dirty].sort((a, b) => a - b);
    uploadChanged(this.positions, changed);
    uploadChanged(this.colors, changed);
    uploadChanged(
      this.normals,
      [...this.normalDirty].sort((a, b) => a - b),
    );
    this.dirty.clear();
    this.normalDirty.clear();
  }
}
