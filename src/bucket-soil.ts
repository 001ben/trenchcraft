import * as T from "three";
import { HALF_WIDTH, floorV, makeFrame, toLocal } from "./bucket-shell";
import { CLOD_RADIUS } from "./soil";
import { frameOf, Simulation, type ScoopCut } from "./simulation";

export const SOIL_COLS = 9,
  SOIL_ROWS = 12,
  SOIL_WIDTH = HALF_WIDTH * 2 - 0.02,
  SOIL_LENGTH = 0.68,
  SOIL_BACK = -0.08;
const COLS = SOIL_COLS,
  ROWS = SOIL_ROWS,
  WIDTH = SOIL_WIDTH,
  LENGTH = SOIL_LENGTH,
  AREA = (WIDTH * LENGTH) / (COLS * ROWS);
export const bucketFloor = floorV;

/**
 * A continuous soil skin over the clods carried in the bowl, plus a short
 * contact strip joining the cut bank to the lip. Heights come straight from
 * the physical clods, so the skin follows what is actually carried.
 */
export class BucketSoil extends T.Group {
  /** Presentation bed: per-cell amounts derived from clod tops, and the carried volume. */
  bed = { amounts: new Float64Array(COLS * ROWS), volume: 0 };
  private surface: T.Mesh<T.BufferGeometry, T.MeshStandardMaterial>;
  private sides: T.Mesh<T.BufferGeometry, T.MeshStandardMaterial>;
  intake: T.Mesh<T.BufferGeometry, T.MeshStandardMaterial>;
  private heights = new Float32Array((COLS + 1) * (ROWS + 1));
  private point = new T.Vector3();
  private frame = makeFrame();
  private local = new Float64Array(3);
  constructor(texture: T.Texture | null) {
    super();
    const material = new T.MeshStandardMaterial({
      color: 0x765135,
      roughness: 1,
      map: texture,
      side: T.DoubleSide,
    });
    this.surface = new T.Mesh(this.grid(ROWS), material);
    this.intake = new T.Mesh(this.grid(2), material);
    const sides = new T.BufferGeometry();
    sides.setAttribute(
      "position",
      new T.BufferAttribute(new Float32Array(COLS * ROWS * 4 * 18), 3).setUsage(
        T.DynamicDrawUsage,
      ),
    );
    sides.setAttribute(
      "normal",
      new T.BufferAttribute(new Float32Array(COLS * ROWS * 4 * 18), 3).setUsage(
        T.DynamicDrawUsage,
      ),
    );
    sides.setAttribute(
      "uv",
      new T.BufferAttribute(new Float32Array(COLS * ROWS * 4 * 12), 2).setUsage(
        T.DynamicDrawUsage,
      ),
    );
    this.sides = new T.Mesh(sides, material);
    this.sides.frustumCulled = false;
    this.sides.receiveShadow = true;
    this.surface.name = "VisibleSoilHeap";
    this.surface.castShadow = true;
    this.surface.receiveShadow = true;
    this.intake.receiveShadow = true;
    this.surface.frustumCulled = this.intake.frustumCulled = false;
    this.add(this.surface, this.sides, this.intake);
  }
  private grid(rows: number) {
    const geo = new T.BufferGeometry(),
      vertices = new Float32Array((COLS + 1) * (rows + 1) * 3),
      uv = new Float32Array((COLS + 1) * (rows + 1) * 2),
      indices: number[] = [];
    for (let z = 0; z <= rows; z++)
      for (let x = 0; x <= COLS; x++) {
        const i = z * (COLS + 1) + x;
        uv[i * 2] = x / COLS;
        uv[i * 2 + 1] = z / rows;
        if (z < rows && x < COLS) {
          const b = i + 1,
            c = i + COLS + 1,
            d = c + 1;
          indices.push(i, c, b, b, c, d);
        }
      }
    geo.setAttribute(
      "position",
      new T.BufferAttribute(vertices, 3).setUsage(T.DynamicDrawUsage),
    );
    geo.setAttribute("uv", new T.BufferAttribute(uv, 2));
    geo.setIndex(indices);
    return geo;
  }
  /** Cell amounts from the highest clod over each cell, in the bed's packed units. */
  private measure(sim: Simulation) {
    const amounts = this.bed.amounts;
    amounts.fill(0);
    frameOf(sim.machine, this.frame);
    const cap = CLOD_RADIUS * 0.85;
    let volume = 0;
    for (const clod of sim.held) {
      volume += clod.volume;
      toLocal(this.frame, clod.x, clod.y, clod.z, this.local);
      const col = Math.floor(((this.local[0] + WIDTH / 2) / WIDTH) * COLS),
        row = Math.floor(((this.local[2] - SOIL_BACK) / LENGTH) * ROWS);
      if (col < 0 || col >= COLS || row < 0 || row >= ROWS) continue;
      const i = row * COLS + col,
        top =
          this.local[1] +
          cap -
          floorV(SOIL_BACK + ((row + 0.5) * LENGTH) / ROWS);
      if (top <= 0) continue;
      const amount = (top * AREA) / 0.58;
      if (amount > amounts[i]) amounts[i] = amount;
    }
    // Fill single-cell holes so the skin reads as one heap, not a checkerboard.
    for (let row = 0; row < ROWS; row++)
      for (let col = 0; col < COLS; col++) {
        const i = row * COLS + col;
        if (amounts[i] > 0) continue;
        let n = 0,
          sum = 0;
        for (const j of [i - 1, i + 1, i - COLS, i + COLS]) {
          if (j < 0 || j >= amounts.length) continue;
          if ((j === i - 1 && col === 0) || (j === i + 1 && col === COLS - 1))
            continue;
          if (amounts[j] > 0) {
            n++;
            sum += amounts[j];
          }
        }
        if (n >= 3) amounts[i] = (sum / n) * 0.7;
      }
    this.bed.volume = volume;
  }
  update(sim: Simulation, dt: number) {
    void dt;
    const cuts = sim.cuts.splice(0);
    this.measure(sim);
    this.visible = sim.held.length > 0;
    if (!this.visible) return;
    const positions = this.surface.geometry.getAttribute("position");
    for (let row = 0; row <= ROWS; row++)
      for (let col = 0; col <= COLS; col++) {
        const i = row * (COLS + 1) + col,
          x = (col * WIDTH) / COLS - WIDTH / 2,
          z = SOIL_BACK + (row * LENGTH) / ROWS;
        let volume = 0,
          count = 0;
        for (let dz = -1; dz <= 0; dz++)
          for (let dx = -1; dx <= 0; dx++) {
            const cx = col + dx,
              rz = row + dz;
            if (cx < 0 || rz < 0 || cx >= COLS || rz >= ROWS) continue;
            volume += this.bed.amounts[rz * COLS + cx];
            count++;
          }
        const depth = ((volume / count) * 0.58) / AREA;
        // Feather into the bowl perimeter; the mass surface cannot show through the cheeks.
        const edge =
          row === ROWS
            ? 0.15
            : col === 0 || col === COLS || row === 0
              ? 0.35
              : 1;
        const y =
          bucketFloor(z) +
          depth * edge +
          Math.min(depth, 0.008) * Math.sin(i * 5.3) * 0.5;
        this.heights[i] = y;
        positions.setXYZ(i, x, y, z);
      }
    positions.needsUpdate = true;
    const indices = this.surface.geometry.index!;
    let count = 0;
    for (let row = 0; row < ROWS; row++)
      for (let col = 0; col < COLS; col++) {
        if (this.bed.amounts[row * COLS + col] < 1e-8) continue;
        const a = row * (COLS + 1) + col,
          b = a + 1,
          c = a + COLS + 1,
          d = c + 1;
        for (const vertex of [a, c, b, b, c, d]) indices.setX(count++, vertex);
      }
    // Unfilled bowl shows steel, not an empty soil-colored sheet.
    this.surface.geometry.setDrawRange(0, count);
    indices.needsUpdate = true;
    // Clear unused triangles so normal computation ignores last frame's soil footprint.
    for (let i = count; i < indices.count; i++) indices.setX(i, 0);
    this.surface.geometry.computeVertexNormals();
    this.closeEdges();
    this.updateIntake(cuts);
  }
  private closeEdges() {
    const top = this.surface.geometry.getAttribute("position"),
      position = this.sides.geometry.getAttribute("position");
    const normal = this.sides.geometry.getAttribute("normal"),
      uv = this.sides.geometry.getAttribute("uv");
    let count = 0;
    const occupied = (x: number, z: number) =>
      x >= 0 &&
      z >= 0 &&
      x < COLS &&
      z < ROWS &&
      this.bed.amounts[z * COLS + x] >= 1e-8;
    const face = (a: number, b: number) => {
      const ax = top.getX(a),
        az = top.getZ(a),
        ay = top.getY(a),
        bx = top.getX(b),
        bz = top.getZ(b),
        by = top.getY(b);
      const floorA = bucketFloor(az),
        floorB = bucketFloor(bz),
        length = Math.hypot(bz - az, bx - ax) || 1;
      for (const [x, y, z] of [
        [ax, ay, az],
        [bx, by, bz],
        [bx, floorB, bz],
        [ax, ay, az],
        [bx, floorB, bz],
        [ax, floorA, az],
      ]) {
        position.setXYZ(count, x, y, z);
        normal.setXYZ(count, (bz - az) / length, 0, (ax - bx) / length);
        uv.setXY(count, x * 2, y * 2);
        count++;
      }
    };
    for (let z = 0; z < ROWS; z++)
      for (let x = 0; x < COLS; x++)
        if (occupied(x, z)) {
          const a = z * (COLS + 1) + x,
            b = a + 1,
            c = a + COLS + 1,
            d = c + 1;
          if (!occupied(x, z - 1)) face(b, a);
          if (!occupied(x + 1, z)) face(d, b);
          if (!occupied(x, z + 1)) face(c, d);
          if (!occupied(x - 1, z)) face(a, c);
        }
    this.sides.geometry.setDrawRange(0, count);
    for (const attribute of [position, normal, uv])
      attribute.needsUpdate = true;
  }
  private updateIntake(cuts: ScoopCut[]) {
    this.intake.visible = cuts.length > 0;
    if (!cuts.length) return;
    const position = this.intake.geometry.getAttribute("position");
    for (let col = 0; col <= COLS; col++) {
      const x = (col * WIDTH) / COLS - WIDTH / 2;
      let total = 0,
        sourceY = 0,
        sourceZ = 0;
      for (const cut of cuts) {
        const weight =
          Math.max(0, 0.24 - Math.abs(x - cut.across)) * cut.volume;
        if (!weight) continue;
        this.point.set(cut.x, cut.top, cut.z);
        this.worldToLocal(this.point);
        total += weight;
        sourceY += this.point.y * weight;
        sourceZ += this.point.z * weight;
      }
      const endY = this.heights[ROWS * (COLS + 1) + col];
      const bankY = total
        ? Math.max(-0.35, Math.min(0.05, sourceY / total))
        : endY;
      const bankZ = total
        ? Math.max(0.7, Math.min(0.85, sourceZ / total))
        : 0.6;
      position.setXYZ(col, x, bankY, bankZ);
      position.setXYZ(
        COLS + 1 + col,
        x,
        total ? Math.max(-0.31, bankY * 0.4 + endY * 0.6) : endY,
        total ? 0.65 : 0.6,
      );
      position.setXYZ(2 * (COLS + 1) + col, x, endY, 0.6);
    }
    position.needsUpdate = true;
    this.intake.geometry.computeVertexNormals();
  }
}
