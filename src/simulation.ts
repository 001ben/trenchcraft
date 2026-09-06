import {
  type Frame,
  MOUTH_NU,
  MOUTH_NV,
  mouthHeight,
  toLocal,
  toWorld,
  makeFrame,
} from "./bucket-shell";
import { CLOD_VOLUME, Soil, SOIL } from "./soil";

export const CELL = 0.25,
  NX = 72,
  NZ = 80,
  CAPACITY = 0.22;
export const ARM = {
  boom: 2.8,
  stick: 2.3,
  baseHeight: 1.25,
  baseForward: 0.35,
  bucketMount: Math.PI / 2,
  toothForward: -0.7,
  toothDown: -0.35,
};
export type Pattern = "ISO" | "Alternate";
export type Controls = {
  lx: number;
  ly: number;
  rx: number;
  ry: number;
  leftTrack: number;
  rightTrack: number;
};
export const neutral = (): Controls => ({
  lx: 0,
  ly: 0,
  rx: 0,
  ry: 0,
  leftTrack: 0,
  rightTrack: 0,
});
export const clamp = (x: number, a: number, b: number) =>
  Math.max(a, Math.min(b, x));
export type Machine = {
  x: number;
  z: number;
  heading: number;
  swing: number;
  boom: number;
  stick: number;
  bucket: number;
  load: number;
};
/** One physical clod of earth. Carried clods live in `held`, loose ones in `falling`. */
export type SoilClod = {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  volume: number;
  asleep?: boolean;
};
export type ScoopCut = {
  x: number;
  z: number;
  top: number;
  bottom: number;
  across: number;
  volume: number;
};
export type Save = {
  version: 3;
  machine: Machine;
  ground: number[];
  deepest: number[];
  pattern: Pattern;
  falling: SoilClod[];
  held: SoilClod[];
};
export function cellPosition(i: number) {
  return {
    x: ((i % NX) + 0.5) * CELL - (NX * CELL) / 2,
    z: (Math.floor(i / NX) + 0.5) * CELL - (NZ * CELL) / 2,
  };
}
export function target(x: number, z: number) {
  return Math.abs(x) < 0.5 && z >= -8 && z < -2;
}
export function spoil(x: number, z: number) {
  return x >= 2.5 && x < 5 && z >= -8.5 && z < -1.5;
}
export function tooth(m: Machine) {
  const a = m.boom,
    b = a + m.stick,
    c = b + ARM.bucketMount - m.bucket;
  const reach =
    ARM.baseForward +
    ARM.boom * Math.cos(a) +
    ARM.stick * Math.cos(b) +
    ARM.toothForward * Math.cos(c) -
    ARM.toothDown * Math.sin(c);
  const y =
    ARM.baseHeight +
    ARM.boom * Math.sin(a) +
    ARM.stick * Math.sin(b) +
    ARM.toothForward * Math.sin(c) +
    ARM.toothDown * Math.cos(c);
  const yaw = m.heading + m.swing;
  return { x: m.x - Math.sin(yaw) * reach, y, z: m.z - Math.cos(yaw) * reach };
}
export function bucketOpening(m: Machine) {
  const angle = m.boom + m.stick + ARM.bucketMount - m.bucket;
  const forward = -0.44 * Math.cos(angle) - 0.9 * Math.sin(angle);
  return {
    x: -Math.sin(m.heading + m.swing) * forward,
    y: -0.44 * Math.sin(angle) + 0.9 * Math.cos(angle),
    z: -Math.cos(m.heading + m.swing) * forward,
  };
}
/**
 * World frame of the Bucket joint: origin at the bucket pivot, local x across
 * the width, local y up when level and local z toward the cutting lip. The
 * tooth at local (0, -0.35, 0.7) lands exactly on tooth(m).
 */
export function frameOf(m: Machine, out: Frame) {
  const a = m.boom,
    b = a + m.stick,
    c = b + ARM.bucketMount - m.bucket,
    yaw = m.heading + m.swing,
    sy = Math.sin(yaw),
    cy = Math.cos(yaw),
    sc = Math.sin(c),
    cc = Math.cos(c);
  const reach =
      ARM.baseForward + ARM.boom * Math.cos(a) + ARM.stick * Math.cos(b),
    y = ARM.baseHeight + ARM.boom * Math.sin(a) + ARM.stick * Math.sin(b);
  out[0] = m.x - sy * reach;
  out[1] = y;
  out[2] = m.z - cy * reach;
  out[3] = cy;
  out[4] = 0;
  out[5] = -sy;
  out[6] = sc * sy;
  out[7] = cc;
  out[8] = sc * cy;
  out[9] = cc * sy;
  out[10] = -sc;
  out[11] = cc * cy;
}
export function axes(c: Controls, p: Pattern) {
  return {
    swing: -c.lx,
    boom: p === "ISO" ? c.ry : c.ly,
    stick: p === "ISO" ? -c.ly : -c.ry,
    curl: -c.rx,
  };
}
const MAX_CLODS = 4000;
export class Simulation {
  machine: Machine = {
    x: 0,
    z: 1.2,
    heading: 0,
    swing: 0,
    boom: 0.58,
    stick: -1.5,
    bucket: 0.15,
    load: 0,
  };
  ground = new Float32Array(NX * NZ);
  deepest = new Float32Array(NX * NZ);
  pattern: Pattern = "ISO";
  /** Loose clods: airborne, rolling or settled but not yet part of the ground. */
  falling: SoilClod[] = [];
  /** Clods carried in the bucket; their volumes sum to machine.load. */
  held: SoilClod[] = [];
  soil = new Soil(this);
  private dischargeIndex = 0;
  private spawnIndex = 0;
  /** Smoothed joint rates, in stick units, for hydraulic ramping. */
  private rates = { swing: 0, boom: 0, stick: 0, curl: 0 };
  /** Drop any ramped motion, for pauses and cleared inputs. */
  resetRates() {
    this.rates.swing = this.rates.boom = this.rates.stick = this.rates.curl = 0;
  }
  resistance = 0;
  cuts: ScoopCut[] = [];
  cutRate = 0;
  changed = new Set<number>();
  dust: { x: number; y: number; z: number; dump: boolean }[] = [];
  lastAction = "Lower the boom toward the first chalk marks.";
  private frame = makeFrame();
  private local = new Float64Array(3);
  private world = new Float64Array(3);
  private rest = new Float64Array(0);
  constructor(save?: Save | null) {
    if (save) {
      this.machine = { ...save.machine };
      this.ground.set(save.ground);
      this.deepest.set(save.deepest);
      this.pattern = save.pattern;
      this.falling = save.falling.map((p) => ({ ...p }));
      this.held = save.held.map((p) => ({ ...p }));
      this.reconcileLoad();
    }
  }
  height(x: number, z: number) {
    const col = Math.floor((x + (NX * CELL) / 2) / CELL),
      row = Math.floor((z + (NZ * CELL) / 2) / CELL);
    return col >= 0 && col < NX && row >= 0 && row < NZ
      ? this.ground[row * NX + col]
      : 0;
  }
  /** Ground height interpolated between cell centres, the surface clods rest on. */
  surface(x: number, z: number) {
    const fx = clamp((x + (NX * CELL) / 2) / CELL - 0.5, 0, NX - 1.000001),
      fz = clamp((z + (NZ * CELL) / 2) / CELL - 0.5, 0, NZ - 1.000001);
    const col = Math.floor(fx),
      row = Math.floor(fz),
      tx = fx - col,
      tz = fz - row,
      i = row * NX + col,
      g = this.ground;
    const a = g[i] + (g[i + 1] - g[i]) * tx,
      b = g[i + NX] + (g[i + NX + 1] - g[i + NX]) * tx;
    return a + (b - a) * tz;
  }
  surfaceNormal(x: number, z: number, out: Float64Array) {
    const fx = clamp((x + (NX * CELL) / 2) / CELL - 0.5, 0, NX - 1.000001),
      fz = clamp((z + (NZ * CELL) / 2) / CELL - 0.5, 0, NZ - 1.000001);
    const col = Math.floor(fx),
      row = Math.floor(fz),
      tx = fx - col,
      tz = fz - row,
      i = row * NX + col,
      g = this.ground;
    const dx =
        ((g[i + 1] - g[i]) * (1 - tz) + (g[i + NX + 1] - g[i + NX]) * tz) /
        CELL,
      dz =
        ((g[i + NX] - g[i]) * (1 - tx) + (g[i + NX + 1] - g[i + 1]) * tx) /
        CELL;
    const inv = 1 / Math.sqrt(dx * dx + 1 + dz * dz);
    out[0] = -dx * inv;
    out[1] = inv;
    out[2] = -dz * inv;
  }
  frameOf(m: Machine, out: Frame) {
    frameOf(m, out);
  }
  canCapture(volume: number) {
    return this.machine.load + volume <= CAPACITY + 1e-9;
  }
  private heldVolume() {
    let v = 0;
    for (const p of this.held) v += p.volume;
    return v;
  }
  /**
   * Make the carried clods match machine.load exactly. Saves from before the
   * physics pass, tools and tests set load directly; the difference appears as
   * clods resting in the bowl, or the last clods are taken away.
   */
  reconcileLoad() {
    const m = this.machine;
    m.load = clamp(m.load, 0, CAPACITY);
    let diff = m.load - this.heldVolume();
    if (Math.abs(diff) <= 1e-7) return;
    if (diff > 0) {
      const n = Math.max(1, Math.round(diff / CLOD_VOLUME)),
        each = diff / n,
        total = this.held.length + n;
      if (this.rest.length < total * 3) this.rest = new Float64Array(total * 3);
      frameOf(m, this.frame);
      const placed = this.soil.shell.restPositions(
        total,
        this.soil.r,
        this.rest,
      );
      for (let k = 0; k < n; k++) {
        const slot = Math.min(placed - 1, this.held.length),
          o = slot * 3;
        toWorld(
          this.frame,
          this.rest[o],
          this.rest[o + 1],
          this.rest[o + 2],
          this.world,
        );
        this.held.push({
          x: this.world[0],
          y: this.world[1],
          z: this.world[2],
          vx: 0,
          vy: 0,
          vz: 0,
          volume: each,
          asleep: false,
        });
      }
      this.soil.anchor(m);
      return;
    }
    while (diff < -1e-7 && this.held.length) {
      const last = this.held[this.held.length - 1];
      if (last.volume <= -diff + 1e-9) {
        this.held.pop();
        diff += last.volume;
      } else {
        last.volume += diff;
        diff = 0;
      }
    }
  }
  /** Volume is transferred between ground and bucket; rendering never awards progress. */
  dig(
    point: { x: number; y: number; z: number },
    dt: number,
    advance = dt * 0.6,
  ) {
    if (CAPACITY - this.machine.load < 1e-8) return 0;
    const yaw = this.machine.heading + this.machine.swing,
      sin = Math.sin(yaw),
      cos = Math.cos(yaw);
    const cx = Math.floor((point.x + (NX * CELL) / 2) / CELL),
      cz = Math.floor((point.z + (NZ * CELL) / 2) / CELL);
    const candidates: {
      i: number;
      x: number;
      z: number;
      old: number;
      depth: number;
      across: number;
    }[] = [];
    let requested = 0;
    for (let row = cz - 2; row <= cz + 2; row++)
      for (let col = cx - 2; col <= cx + 2; col++) {
        if (row < 0 || row >= NZ || col < 0 || col >= NX) continue;
        const i = row * NX + col,
          p = cellPosition(i),
          old = this.ground[i];
        const across = (p.x - point.x) * cos - (p.z - point.z) * sin;
        const ahead = (p.x - point.x) * sin + (p.z - point.z) * cos;
        if (Math.abs(across) > 0.39 || Math.abs(ahead) > 0.19) continue;
        const coverage = clamp(
          (0.39 + CELL / 2 - Math.abs(across)) / CELL,
          0,
          1,
        );
        const depth =
          Math.min(
            Math.max(0, old - Math.max(-1.4, point.y)),
            Math.max(0, dt) * 0.8,
          ) * coverage;
        if (depth <= 0) continue;
        candidates.push({ i, ...p, old, depth, across });
        requested += depth * CELL * CELL;
      }
    if (!requested) return 0;
    // Cut volume follows how far the lip actually swept into the bank, not time alone.
    const penetration = Math.max(0, this.height(point.x, point.z) - point.y);
    const budget = 0.78 * Math.max(0, advance) * penetration;
    const fraction = Math.min(
      1,
      budget / requested,
      Math.max(0, CAPACITY - this.machine.load) / requested,
    );
    let removed = 0;
    const parcels: ScoopCut[] = [];
    for (const p of candidates) {
      if (fraction <= 0) break;
      this.ground[p.i] = p.old - p.depth * fraction;
      const volume = (p.old - this.ground[p.i]) * CELL * CELL;
      if (volume <= 0) continue;
      this.machine.load += volume;
      removed += volume;
      const parcel = {
        x: p.x,
        z: p.z,
        top: p.old,
        bottom: this.ground[p.i],
        across: p.across,
        volume,
      };
      parcels.push(parcel);
      if (this.cuts.length < 64) this.cuts.push(parcel);
      else this.cuts[this.cuts.length - 1].volume += volume;
      this.deepest[p.i] = Math.min(this.deepest[p.i], this.ground[p.i]);
      this.changed.add(p.i);
    }
    if (removed > 0) {
      this.capture(removed, parcels);
      this.cutRate += removed / Math.max(dt, 0.001);
      this.lastAction =
        "Lift, swing right to the spoil strip, then open the bucket.";
    }
    return removed;
  }
  /** Cut earth enters the bowl over the lip as clods; tiny bites top up the last clod. */
  private capture(volume: number, parcels: ScoopCut[]) {
    const last = this.held[this.held.length - 1];
    if (
      last &&
      ((volume < 0.5 * CLOD_VOLUME && last.volume < 1.6 * CLOD_VOLUME) ||
        // Near the solver's pool limit, grow existing clods rather than lose volume.
        this.held.length + this.falling.length > SOIL.capacity - 100)
    ) {
      last.volume += volume;
      return;
    }
    const n = Math.max(1, Math.round(volume / CLOD_VOLUME)),
      each = volume / n,
      r = this.soil.r,
      m = this.machine,
      shell = this.soil.shell;
    frameOf(m, this.frame);
    void parcels;
    for (let k = 0; k < n; k++) {
      // Next free resting slot: the bowl fills from the lip inward, layer by layer.
      const s = this.spawnIndex++;
      shell.slot(this.held.length, this.local);
      const x = this.local[0] + (((s * 0.7548776662) % 1) - 0.5) * 0.5 * r,
        v = this.local[1] + 0.005,
        u = this.local[2] + (((s * 0.5698402909) % 1) - 0.5) * 0.5 * r;
      toWorld(this.frame, x, v, u, this.world);
      this.held.push({
        x: this.world[0],
        y: this.world[1],
        z: this.world[2],
        vx: 0,
        vy: 0,
        vz: 0,
        volume: each,
        asleep: false,
      });
    }
    this.soil.anchor(m);
  }
  /** Earth stays in flight until it reaches the ground; that volume is saved too. */
  dump(point: { x: number; y: number; z: number }, dt: number) {
    if (
      this.falling.length >= MAX_CLODS ||
      Math.abs(point.x) > 8.5 ||
      Math.abs(point.z) > 9.5 ||
      this.height(point.x, point.z) >= 1.799
    )
      return 0;
    const requested = Math.min(this.machine.load, Math.max(0, dt) * 0.22);
    if (requested <= 1e-7) return 0;
    this.reconcileLoad();
    const opening = bucketOpening(this.machine);
    const yaw = this.machine.heading + this.machine.swing;
    const right = { x: Math.cos(yaw), z: -Math.sin(yaw) };
    let released = 0,
      count = 0;
    while (this.held.length && released < requested - 1e-9) {
      const clod = this.held.pop()!;
      // Scatter over a small disc under the mouth so the clods released in one
      // frame do not start inside each other.
      const k = this.dischargeIndex++,
        angle = k * 2.39996323,
        radius = 0.3 * Math.sqrt((k * 0.61803398875) % 1),
        across = Math.cos(angle) * radius,
        along = Math.sin(angle) * radius;
      clod.x = point.x + right.x * across - right.z * along;
      clod.y = point.y + Math.floor(count++ / 12) * this.soil.r * 2.2;
      clod.z = point.z + right.z * across + right.x * along;
      clod.vx = opening.x * 0.2 + right.x * across * 0.4;
      clod.vy = -1.0;
      clod.vz = opening.z * 0.2 + right.z * across * 0.4;
      clod.asleep = false;
      this.falling.push(clod);
      released += clod.volume;
    }
    this.machine.load = Math.max(0, this.machine.load - released);
    return released;
  }
  /** Once the mouth faces down, the carried load lets go from the lip inward. */
  private releaseTipped(dt: number, tip: { x: number; y: number; z: number }) {
    const m = this.machine;
    if (
      m.load <= 0 ||
      !this.held.length ||
      bucketOpening(m).y >= 0.25 ||
      tip.y <= this.height(tip.x, tip.z) + 0.12
    )
      return;
    frameOf(m, this.frame);
    const order = this.held.map((clod, k) => {
      toLocal(this.frame, clod.x, clod.y, clod.z, this.local);
      return { k, exit: mouthHeight(this.local[2], this.local[1]) };
    });
    order.sort((a, b) => b.exit - a.exit);
    let released = 0;
    const quota = dt * SOIL.tipRate,
      loose = new Set<number>();
    for (const { k } of order) {
      if (released >= quota && loose.size) break;
      loose.add(k);
      released += this.held[k].volume;
    }
    // Released earth is helped out of the mouth, the way an operator shakes a bucket.
    const f = this.frame,
      nx = MOUTH_NV * f[6] + MOUTH_NU * f[9],
      ny = MOUTH_NV * f[7] + MOUTH_NU * f[10],
      nz = MOUTH_NV * f[8] + MOUTH_NU * f[11];
    const kept: SoilClod[] = [];
    for (const [k, clod] of this.held.entries()) {
      if (loose.has(k)) {
        // Uneven shoves break the load into a stream instead of one falling brick.
        const s = this.spawnIndex++,
          push = 0.7 + ((s * 0.3247179572) % 1) * 0.9,
          jx = (((s * 0.61803398875) % 1) - 0.5) * 0.9,
          jy = (((s * 0.7548776662) % 1) - 0.5) * 0.6,
          jz = (((s * 0.5698402909) % 1) - 0.5) * 0.9;
        clod.asleep = false;
        clod.vx += nx * push + jx;
        clod.vy += ny * push + 0.3 + jy;
        clod.vz += nz * push + jz;
        this.falling.push(clod);
      } else kept.push(clod);
    }
    this.held = kept;
    m.load = this.held.length ? Math.max(0, m.load - released) : 0;
  }
  /**
   * A settled clod becomes ground: it fills the lowest of the cells around it,
   * so piles spread at the 25 cm grid instead of growing single-cell spikes.
   */
  absorb(clod: SoilClod) {
    const cx = Math.floor((clod.x + (NX * CELL) / 2) / CELL),
      cz = Math.floor((clod.z + (NZ * CELL) / 2) / CELL),
      rise = clod.volume / (CELL * CELL);
    let best = -1,
      lowest = Infinity;
    for (let row = cz - 1; row <= cz + 1; row++)
      for (let col = cx - 1; col <= cx + 1; col++) {
        if (row < 0 || row >= NZ || col < 0 || col >= NX) continue;
        const i = row * NX + col;
        if (this.ground[i] + rise > 1.8) continue;
        const rank = this.ground[i] - (row === cz && col === cx ? 1e-4 : 0);
        if (rank < lowest) {
          lowest = rank;
          best = i;
        }
      }
    if (best < 0) return false;
    this.ground[best] += rise;
    this.changed.add(best);
    this.lastAction = spoil(clod.x, clod.z)
      ? "Tidy pile. Swing back for the next bite."
      : "Place the next load inside the amber spoil strip.";
    return true;
  }
  update(c: Controls, dt: number) {
    dt = clamp(dt, 0, 0.05);
    const m = this.machine;
    this.reconcileLoad();
    const pose = { ...m };
    const previousResistance = this.resistance;
    this.resistance = 0;
    this.cutRate = 0;
    if (c.leftTrack || c.rightTrack) {
      // Two track levers: forward/reverse per side, independent of upper-body swing.
      const left = clamp(c.leftTrack, -1, 1),
        right = clamp(c.rightTrack, -1, 1);
      m.heading += (right - left) * dt * 0.65;
      m.x = clamp(
        m.x - Math.sin(m.heading) * (left + right) * dt * 0.55,
        -7.2,
        7.2,
      );
      m.z = clamp(
        m.z - Math.cos(m.heading) * (left + right) * dt * 0.55,
        -8.2,
        8.2,
      );
      if (Math.abs(left) + Math.abs(right) > 0.1)
        this.lastAction =
          "Travel levers move the tracks. The joysticks still control the arm.";
    }
    const a = axes(c, this.pattern),
      before = { ...m };
    const flow =
      1 /
      Math.max(
        1,
        (Math.abs(a.boom) + Math.abs(a.stick) + Math.abs(a.curl)) * 0.65,
      );
    const biteFlow = flow * (1 - previousResistance * 0.28);
    // Hydraulic response: rates ramp toward the stick command so a carried load
    // is not jolted off the bucket; releasing a stick still stops quickly.
    const ramp = (current: number, target: number, up: number, down: number) =>
      current +
      (target - current) *
        (1 -
          Math.exp(-dt / (Math.abs(target) > Math.abs(current) ? up : down)));
    const r = this.rates;
    r.swing = ramp(r.swing, a.swing, 0.4, 0.12);
    r.boom = ramp(r.boom, a.boom, 0.22, 0.1);
    r.stick = ramp(r.stick, a.stick, 0.22, 0.1);
    r.curl = ramp(r.curl, a.curl, 0.18, 0.1);
    m.swing += r.swing * dt * 0.6;
    m.boom = clamp(
      m.boom + r.boom * dt * 0.4 * flow * (1 - (m.load / CAPACITY) * 0.15),
      -0.12,
      1.3,
    );
    m.stick = clamp(
      m.stick + r.stick * dt * 0.55 * (a.stick < 0 ? biteFlow : flow),
      -2.55,
      -0.3,
    );
    m.bucket = clamp(
      m.bucket + r.curl * dt * 0.95 * (a.curl > 0 ? biteFlow : flow),
      -1.2,
      1.7,
    );
    let tip = tooth(m);
    const previous = tooth(before);
    const inward =
      (tip.x - previous.x) * Math.sin(m.heading + m.swing) +
      (tip.z - previous.z) * Math.cos(m.heading + m.swing);
    if (
      tip.y < this.height(tip.x, tip.z) + 0.03 &&
      inward > 1e-6 &&
      (a.curl > 0.05 || a.stick < -0.05) &&
      bucketOpening(m).y > -0.15
    )
      this.dig(tip, dt, inward);
    this.resistance = clamp(this.cutRate / 0.1, 0, 1);
    // Limit penetration through uncut ground. Curl/crowd must remove soil to advance.
    const penetration = this.height(tip.x, tip.z) - tip.y;
    if (penetration > 0.1 && tip.y < previous.y) {
      this.resistance = clamp((penetration - 0.1) * 8, 0, 1);
      const proposed = { ...m };
      let lo = 0,
        hi = 1;
      for (let i = 0; i < 9; i++) {
        const t = (lo + hi) / 2;
        for (const key of ["boom", "stick", "bucket"] as const)
          m[key] = before[key] + (proposed[key] - before[key]) * t;
        const p = tooth(m);
        if (p.y >= this.height(p.x, p.z) - 0.1) lo = t;
        else hi = t;
      }
      for (const key of ["boom", "stick", "bucket"] as const)
        m[key] = before[key] + (proposed[key] - before[key]) * lo;
      tip = tooth(m);
      this.lastAction =
        "Teeth against the soil. Curl and draw the arm toward you to take a bite.";
    }
    if (dt > 0) this.soil.step(dt, pose, m);
    this.releaseTipped(dt, tip);
    if (m.load > CAPACITY * 0.98)
      this.lastAction =
        "Bucket full. Raise the boom before swinging to the spoil strip.";
    if (tip.y < -1.4)
      this.lastAction =
        "Ease the boom up. The practice trench only needs 60 cm depth.";
  }
  score() {
    let totalCut = 0,
      onLine = 0,
      done = 0,
      targets = 0,
      tidy = 0,
      above = 0;
    for (let i = 0; i < this.ground.length; i++) {
      const p = cellPosition(i),
        cut = Math.max(0, -this.deepest[i]);
      totalCut += cut;
      if (target(p.x, p.z)) {
        targets++;
        onLine += cut;
        done += Math.min(0.6, Math.max(0, -this.ground[i])) / 0.6;
      }
      const pile = Math.max(0, this.ground[i]);
      above += pile;
      if (spoil(p.x, p.z)) tidy += pile;
    }
    const progress = done / targets,
      straightness = totalCut ? onLine / totalCut : 1,
      tidiness = above ? tidy / above : 1;
    return {
      progress,
      straightness,
      tidiness,
      stars:
        Number(progress >= 0.8) +
        Number(progress >= 0.9 && straightness >= 0.85) +
        Number(progress >= 0.95 && straightness >= 0.95 && tidiness >= 0.85),
    };
  }
  snapshot(): Save {
    return {
      version: 3,
      machine: { ...this.machine },
      ground: Array.from(this.ground),
      deepest: Array.from(this.deepest),
      pattern: this.pattern,
      falling: this.falling.map((p) => ({ ...p })),
      held: this.held.map((p) => ({ ...p })),
    };
  }
}
function validClods(list: unknown): list is SoilClod[] {
  return (
    Array.isArray(list) &&
    list.length <= MAX_CLODS &&
    list.every(
      (p) =>
        p &&
        typeof p === "object" &&
        ["x", "y", "z", "vx", "vy", "vz", "volume"].every((k) =>
          Number.isFinite((p as SoilClod)[k as keyof SoilClod]),
        ) &&
        Math.abs(p.x) <= 9 &&
        Math.abs(p.z) <= 10 &&
        p.y >= -2 &&
        p.y <= 10 &&
        Math.abs(p.vx) <= 25 &&
        Math.abs(p.vz) <= 25 &&
        Math.abs(p.vy) <= 25 &&
        p.volume > 0 &&
        p.volume <= CAPACITY &&
        (p.asleep === undefined || typeof p.asleep === "boolean"),
    )
  );
}
export function parseSave(raw: string | null): Save | null {
  try {
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (data.version === 1) {
      data.version = 2;
      data.falling = [];
    }
    if (data.version === 2) {
      // Bucket contents were a bare volume; the constructor rests it in the bowl as clods.
      data.version = 3;
      if (!Array.isArray(data.held)) data.held = [];
    }
    const s = data as Save;
    if (
      s.version !== 3 ||
      !["ISO", "Alternate"].includes(s.pattern) ||
      !s.machine
    )
      return null;
    const ranges: Record<keyof Machine, [number, number]> = {
      x: [-7.2, 7.2],
      z: [-8.2, 8.2],
      heading: [-1e6, 1e6],
      swing: [-1e6, 1e6],
      boom: [-0.12, 1.3],
      stick: [-2.55, -0.3],
      bucket: [-1.2, 1.7],
      load: [0, CAPACITY + 1e-6],
    };
    for (const key of Object.keys(ranges) as (keyof Machine)[]) {
      const v = s.machine[key],
        [lo, hi] = ranges[key];
      if (!Number.isFinite(v) || v < lo || v > hi) return null;
    }
    if (
      !Array.isArray(s.ground) ||
      !Array.isArray(s.deepest) ||
      s.ground.length !== NX * NZ ||
      s.deepest.length !== NX * NZ
    )
      return null;
    if (
      s.ground.some((v) => !Number.isFinite(v) || v < -1.401 || v > 1.801) ||
      s.deepest.some(
        (v, i) =>
          !Number.isFinite(v) || v < -1.401 || v > 0 || v > s.ground[i] + 1e-6,
      )
    )
      return null;
    if (!validClods(s.falling) || !validClods(s.held)) return null;
    return s;
  } catch {
    return null;
  }
}
