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
export type SoilClod = {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  volume: number;
};
export type Save = {
  version: 2;
  machine: Machine;
  ground: number[];
  deepest: number[];
  pattern: Pattern;
  falling: SoilClod[];
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
  falling: SoilClod[] = [];
  private dischargeIndex = 0;
  resistance = 0;
  changed = new Set<number>();
  dust: { x: number; y: number; z: number; dump: boolean }[] = [];
  lastAction = "Lower the boom toward the first chalk marks.";
  constructor(save?: Save | null) {
    if (save) {
      this.machine = { ...save.machine };
      this.ground.set(save.ground);
      this.deepest.set(save.deepest);
      this.pattern = save.pattern;
      this.falling = save.falling.map((p) => ({ ...p }));
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
  /** Earth stays in flight until it reaches the ground; that volume is saved too. */
  dump(point: { x: number; y: number; z: number }, dt: number) {
    if (
      this.falling.length >= 64 ||
      Math.abs(point.x) > 8.5 ||
      Math.abs(point.z) > 9.5 ||
      this.height(point.x, point.z) >= 1.799
    )
      return 0;
    const volume = Math.min(this.machine.load, Math.max(0, dt) * 0.22);
    if (volume <= 1e-7) return 0;
    const opening = bucketOpening(this.machine);
    // Scatter across the cutting lip instead of emitting one solid column.
    const across = (((this.dischargeIndex++ * 0.61803398875) % 1) - 0.5) * 0.56;
    const yaw = this.machine.heading + this.machine.swing;
    const right = { x: Math.cos(yaw), z: -Math.sin(yaw) };
    this.machine.load -= volume;
    this.falling.push({
      ...point,
      x: point.x + right.x * across,
      z: point.z + right.z * across,
      vx: opening.x * 0.2 + right.x * across * 0.4,
      vy: -0.2,
      vz: opening.z * 0.2 + right.z * across * 0.4,
      volume,
    });
    return volume;
  }
  private deposit(point: SoilClod) {
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
    candidates.sort((a, b) => this.ground[a] - this.ground[b]);
    for (const i of candidates) {
      const old = this.ground[i],
        amount = Math.min(point.volume, Math.max(0, 1.8 - old) * CELL * CELL);
      if (amount <= 0) continue;
      this.ground[i] += amount / (CELL * CELL);
      point.volume = Math.max(
        0,
        point.volume - (this.ground[i] - old) * CELL * CELL,
      );
      this.changed.add(i);
      if (point.volume < 1e-7) break;
    }
  }
  private fall(dt: number) {
    for (let i = this.falling.length - 1; i >= 0; i--) {
      const p = this.falling[i];
      p.vy -= 9.81 * dt;
      p.y += p.vy * dt;
      p.x = clamp(p.x + p.vx * dt, -8.7, 8.7);
      p.z = clamp(p.z + p.vz * dt, -9.7, 9.7);
      const ground = this.height(p.x, p.z);
      if (p.y > ground + 0.025) continue;
      this.deposit(p);
      if (p.volume < 1e-7) {
        this.dust.push({ ...p, dump: true });
        this.falling.splice(i, 1);
        this.lastAction = spoil(p.x, p.z)
          ? "Tidy pile. Swing back for the next bite."
          : "Place the next load inside the amber spoil strip.";
      } else {
        p.y = this.height(p.x, p.z) + 0.025;
        p.vy = 0;
      }
    }
  }
  update(c: Controls, dt: number) {
    dt = clamp(dt, 0, 0.05);
    const m = this.machine;
    this.fall(dt);
    this.resistance = 0;
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
    const a = axes(c, this.pattern),
      before = { ...m };
    const flow =
      1 /
      Math.max(
        1,
        (Math.abs(a.boom) + Math.abs(a.stick) + Math.abs(a.curl)) * 0.65,
      );
    m.swing += a.swing * dt * 0.6;
    m.boom = clamp(
      m.boom + a.boom * dt * 0.4 * flow * (1 - (m.load / CAPACITY) * 0.15),
      -0.12,
      1.3,
    );
    m.stick = clamp(m.stick + a.stick * dt * 0.55 * flow, -2.55, -0.3);
    m.bucket = clamp(m.bucket + a.curl * dt * 0.95 * flow, -1.2, 1.7);
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
      this.dig(tip, dt);
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
    if (
      m.load > 0 &&
      bucketOpening(m).y < 0.25 &&
      tip.y > this.height(tip.x, tip.z) + 0.12
    )
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
      version: 2,
      machine: { ...this.machine },
      ground: Array.from(this.ground),
      deepest: Array.from(this.deepest),
      pattern: this.pattern,
      falling: this.falling.map((p) => ({ ...p })),
    };
  }
}
export function parseSave(raw: string | null): Save | null {
  try {
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (data.version === 1) {
      data.version = 2;
      data.falling = [];
    }
    const s = data as Save;
    if (
      s.version !== 2 ||
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
    if (
      !Array.isArray(s.falling) ||
      s.falling.length > 64 ||
      s.falling.some(
        (p) =>
          !p ||
          !["x", "y", "z", "vx", "vy", "vz", "volume"].every((k) =>
            Number.isFinite(p[k as keyof SoilClod]),
          ) ||
          Math.abs(p.x) > 9 ||
          Math.abs(p.z) > 10 ||
          p.y < -2 ||
          p.y > 10 ||
          Math.abs(p.vx) > 3 ||
          Math.abs(p.vz) > 3 ||
          Math.abs(p.vy) > 20 ||
          p.volume <= 0 ||
          p.volume > CAPACITY,
      )
    )
      return null;
    return s;
  } catch {
    return null;
  }
}
