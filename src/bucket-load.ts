import { clamp, type ScoopCut } from "./simulation";

export const SOIL_COLS = 9,
  SOIL_ROWS = 12,
  SOIL_WIDTH = 0.69,
  SOIL_LENGTH = 0.65;
const AREA = (SOIL_WIDTH * SOIL_LENGTH) / (SOIL_COLS * SOIL_ROWS);
export const soilX = (col: number) =>
  ((col + 0.5) * SOIL_WIDTH) / SOIL_COLS - SOIL_WIDTH / 2;
export const soilZ = (row: number) =>
  -0.06 + ((row + 0.5) * SOIL_LENGTH) / SOIL_ROWS;
const profile = [
  [-0.06, -0.28],
  [0.08, -0.4],
  [0.24, -0.46],
  [0.36, -0.445],
  [0.49, -0.39],
  [0.59, -0.32],
];
export function bucketFloor(z: number) {
  // Inside of the authored rolled steel shell, in the Bucket joint's coordinates.
  for (let i = 1; i < profile.length; i++)
    if (z <= profile[i][0]) {
      const [a, h] = profile[i - 1],
        [b, k] = profile[i];
      return h + (k - h) * clamp((z - a) / (b - a), 0, 1);
    }
  return -0.32;
}

/** A bounded shallow granular bed inside the scoop. Its volume follows captured soil. */
const floors = Float64Array.from({ length: SOIL_ROWS }, (_, row) =>
  bucketFloor(soilZ(row)),
);
export class BucketLoad {
  amounts = new Float64Array(SOIL_COLS * SOIL_ROWS);
  private pass = 0;
  get volume() {
    return this.amounts.reduce((a, b) => a + b, 0);
  }
  height(i: number) {
    // Excavated loose volume packs down when held in the bucket.
    return floors[Math.floor(i / SOIL_COLS)] + (this.amounts[i] * 0.58) / AREA;
  }
  update(load: number, cuts: readonly ScoopCut[], angle: number, dt: number) {
    let difference = load - this.volume;
    if (difference > 1e-9) {
      for (const cut of cuts) {
        const amount = Math.min(difference, cut.volume);
        let weight = 0;
        for (let x = 0; x < SOIL_COLS; x++)
          weight += Math.max(0, 0.2 - Math.abs(soilX(x) - cut.across));
        if (!weight) continue;
        for (let x = 0; x < SOIL_COLS; x++) {
          const share =
            (amount * Math.max(0, 0.2 - Math.abs(soilX(x) - cut.across))) /
            weight;
          this.amounts[(SOIL_ROWS - 1) * SOIL_COLS + x] += share * 0.65;
          this.amounts[(SOIL_ROWS - 2) * SOIL_COLS + x] += share * 0.35;
        }
        difference -= amount;
      }
      // Loading a save already containing soil starts with that soil resting in the bowl.
      if (difference > 1e-9) {
        this.rest(load, angle);
      }
    } else if (difference < 0) {
      // Discharged volume leaves the cutting lip first, exposing the bowl behind it.
      for (let row = SOIL_ROWS - 1; row >= 0 && difference < 0; row--) {
        let available = 0;
        for (let x = 0; x < SOIL_COLS; x++)
          available += this.amounts[row * SOIL_COLS + x];
        if (!available) continue;
        const fraction = Math.min(1, -difference / available);
        for (let x = 0; x < SOIL_COLS; x++)
          this.amounts[row * SOIL_COLS + x] *= 1 - fraction;
        difference += available * fraction;
      }
    }
    if (load < 1e-8) {
      this.amounts.fill(0);
      return;
    }
    const c = Math.cos(angle),
      s = Math.sin(angle),
      step = clamp(dt, 0, 0.05) / 4;
    // Four local relaxation sweeps: gravity + angle of repose, never all-pairs particles.
    for (let pass = 0; pass < 4; pass++) {
      const reverse = this.pass++ % 2 !== 0;
      for (let k = 0; k < this.amounts.length; k++) {
        const i = reverse ? this.amounts.length - 1 - k : k,
          x = i % SOIL_COLS,
          row = Math.floor(i / SOIL_COLS);
        if (x + 1 < SOIL_COLS)
          this.flow(i, i + 1, SOIL_WIDTH / SOIL_COLS, c, s, step);
        if (row + 1 < SOIL_ROWS)
          this.flow(i, i + SOIL_COLS, SOIL_LENGTH / SOIL_ROWS, c, s, step);
      }
    }
  }
  private rest(load: number, angle: number) {
    const c = Math.max(0.25, Math.cos(angle)),
      s = Math.sin(angle);
    let lo = -2,
      hi = 2;
    for (let n = 0; n < 24; n++) {
      const level = (lo + hi) / 2;
      let volume = 0;
      for (let i = 0; i < this.amounts.length; i++) {
        const row = Math.floor(i / SOIL_COLS);
        volume +=
          (Math.max(0, (level + soilZ(row) * s) / c - floors[row]) * AREA) /
          0.58;
      }
      if (volume > load) hi = level;
      else lo = level;
    }
    for (let i = 0; i < this.amounts.length; i++) {
      const row = Math.floor(i / SOIL_COLS);
      this.amounts[i] =
        (Math.max(0, ((lo + hi) / 2 + soilZ(row) * s) / c - floors[row]) *
          AREA) /
        0.58;
    }
    const scale = load / this.volume;
    for (let i = 0; i < this.amounts.length; i++) this.amounts[i] *= scale;
  }
  private flow(
    a: number,
    b: number,
    distance: number,
    c: number,
    s: number,
    dt: number,
  ) {
    const slope =
      (this.height(a) - this.height(b)) * c -
      (soilZ(Math.floor(a / SOIL_COLS)) - soilZ(Math.floor(b / SOIL_COLS))) * s;
    const excess = Math.abs(slope) - distance * 0.42;
    if (excess <= 0) return;
    const from = slope > 0 ? a : b,
      to = slope > 0 ? b : a;
    const amount = Math.min(this.amounts[from] * 0.22, excess * dt * 0.45);
    this.amounts[from] -= amount;
    this.amounts[to] += amount;
  }
}
