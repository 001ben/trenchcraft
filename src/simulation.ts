export const CELL = 0.25,
  NX = 72,
  NZ = 80,
  CAPACITY = 0.22;
export const ARM = {
  boom: 2.8,
  stick: 2.3,
  baseHeight: 1.25,
  baseForward: 0.35,
  toothForward: 0.7,
  toothDown: -0.35,
};
export type Pattern = "ISO" | "Alternate";
export type Controls = {
  lx: number;
  ly: number;
  rx: number;
  ry: number;
  travel: boolean;
};
export const neutral = (): Controls => ({
  lx: 0,
  ly: 0,
  rx: 0,
  ry: 0,
  travel: false,
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
export type Save = {
  version: 1;
  machine: Machine;
  ground: number[];
  deepest: number[];
  pattern: Pattern;
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
    c = b + m.bucket;
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
export function axes(c: Controls, p: Pattern) {
  return {
    swing: -c.lx,
    boom: p === "ISO" ? c.ry : c.ly,
    stick: p === "ISO" ? -c.ly : -c.ry,
    curl: -c.rx,
  };
}
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
  changed = new Set<number>();
  dust: { x: number; y: number; z: number; dump: boolean }[] = [];
  lastAction = "Lower the boom toward the first chalk marks.";
  constructor(save?: Save | null) {
    if (save) {
      this.machine = { ...save.machine };
      this.ground.set(save.ground);
      this.deepest.set(save.deepest);
      this.pattern = save.pattern;
    }
  }
  height(x: number, z: number) {
    const col = Math.floor((x + (NX * CELL) / 2) / CELL),
      row = Math.floor((z + (NZ * CELL) / 2) / CELL);
    return col >= 0 && col < NX && row >= 0 && row < NZ
      ? this.ground[row * NX + col]
      : 0;
  }
  /** Volume is transferred between ground and bucket; rendering never awards progress. */
  dig(point: { x: number; y: number; z: number }, dt: number) {
    let removed = 0;
    const cx = Math.floor((point.x + (NX * CELL) / 2) / CELL),
      cz = Math.floor((point.z + (NZ * CELL) / 2) / CELL);
    for (let row = cz - 2; row <= cz + 2; row++)
      for (let col = cx - 2; col <= cx + 2; col++) {
        if (row < 0 || row >= NZ || col < 0 || col >= NX) continue;
        const i = row * NX + col,
          p = cellPosition(i);
        if (Math.hypot(p.x - point.x, p.z - point.z) > 0.42) continue;
        const old = this.ground[i];
        const cut = Math.min(
          Math.max(0, old - Math.max(-1.4, point.y)),
          dt * 0.8,
          Math.max(0, CAPACITY - this.machine.load) / (CELL * CELL),
        );
        if (cut <= 0) continue;
        this.ground[i] = old - cut;
        const volume = (old - this.ground[i]) * CELL * CELL;
        this.machine.load += volume;
        removed += volume;
        this.deepest[i] = Math.min(this.deepest[i], this.ground[i]);
        this.changed.add(i);
      }
    if (removed > 0) {
      this.dust.push({ ...point, dump: false });
      this.lastAction =
        "Lift, swing right to the spoil strip, then open the bucket.";
    }
    return removed;
  }
  dump(point: { x: number; y: number; z: number }, dt: number) {
    let deposited = 0;
    const cx = Math.floor((point.x + (NX * CELL) / 2) / CELL),
      cz = Math.floor((point.z + (NZ * CELL) / 2) / CELL);
    const candidates: number[] = [];
    for (let row = cz - 2; row <= cz + 2; row++)
      for (let col = cx - 2; col <= cx + 2; col++) {
        if (row < 0 || row >= NZ || col < 0 || col >= NX) continue;
        const i = row * NX + col,
          p = cellPosition(i);
        if (Math.hypot(p.x - point.x, p.z - point.z) < 0.6) candidates.push(i);
      }
    // Prefer the lowest cells so a mound spreads instead of becoming a thin tower.
    candidates.sort((a, b) => this.ground[a] - this.ground[b]);
    let budget = Math.min(this.machine.load, dt * 0.22);
    for (const i of candidates) {
      const volume = Math.min(
        budget,
        Math.max(0, 1.8 - this.ground[i]) * CELL * CELL,
      );
      if (volume <= 0) continue;
      const old = this.ground[i];
      this.ground[i] += volume / (CELL * CELL);
      const placed = (this.ground[i] - old) * CELL * CELL;
      this.machine.load = Math.max(0, this.machine.load - placed);
      budget -= placed;
      deposited += placed;
      this.changed.add(i);
      if (budget <= 1e-7) break;
    }
    if (deposited > 0) {
      this.dust.push({ ...point, dump: true });
      this.lastAction = spoil(point.x, point.z)
        ? "Tidy pile. Swing back for your next bite."
        : "Try placing the next load inside the amber spoil strip.";
    }
    return deposited;
  }
  update(c: Controls, dt: number) {
    dt = clamp(dt, 0, 0.05);
    const m = this.machine;
    if (c.travel) {
      // Two track levers: forward/reverse per side, independent of upper-body swing.
      const left = -c.ly,
        right = -c.ry;
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
          "Tracks mode · each stick drives one track. Switch back to Dig when lined up.";
      return;
    }
    const a = axes(c, this.pattern);
    m.swing += a.swing * dt * 0.6;
    m.boom = clamp(m.boom + a.boom * dt * 0.4, -0.12, 1.3);
    m.stick = clamp(m.stick + a.stick * dt * 0.55, -2.55, -0.3);
    m.bucket = clamp(m.bucket + a.curl * dt * 0.95, -1.2, 1.7);
    const tip = tooth(m),
      ground = this.height(tip.x, tip.z);
    if (tip.y < ground + 0.03 && (a.curl > 0.05 || a.stick < -0.05))
      this.dig(tip, dt);
    if (a.curl < -0.05 && m.bucket < 0.0 && tip.y > ground + 0.2)
      this.dump(tip, dt);
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
      version: 1,
      machine: { ...this.machine },
      ground: Array.from(this.ground),
      deepest: Array.from(this.deepest),
      pattern: this.pattern,
    };
  }
}
export function parseSave(raw: string | null): Save | null {
  try {
    if (!raw) return null;
    const s = JSON.parse(raw) as Save;
    if (
      s.version !== 1 ||
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
    return s;
  } catch {
    return null;
  }
}
