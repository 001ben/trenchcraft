/**
 * Physical soil: clods are equal-radius particles solved with position-based
 * dynamics (pairwise contacts with Coulomb friction and light cohesion), the
 * bucket shell pushes and carries them, and settled clods sleep and are given
 * back to the ground grid. The simulation owns the clod objects in its held
 * and falling lists; this solver mirrors them into typed arrays each step and
 * writes positions back, so saves, tools and tests keep working with plain
 * objects. Pure TypeScript: no DOM, no renderer.
 */
import {
  BucketShell,
  makeFrame,
  toLocal,
  toWorld,
  type Frame,
} from "./bucket-shell";
import type { Machine, SoilClod } from "./simulation";

/** Bank volume one nominal clod stands for. */
export const CLOD_VOLUME = 2.5e-4;
/** Loose soil swells; in the bowl it packs to about 58% of its excavated bulk. */
export const CLOD_RADIUS = Math.cbrt(
  (0.58 * 0.6 * CLOD_VOLUME * 3) / (4 * Math.PI),
);
export const SOIL = {
  capacity: 6000,
  substeps: 5,
  gravity: 9.81,
  soilStatic: 0.7,
  soilKinetic: 0.55,
  steelStatic: 0.5,
  steelKinetic: 0.4,
  groundStatic: 1.0,
  groundKinetic: 0.85,
  cohesion: 0.04,
  cohesionRange: 0.35,
  sleepSpeed: 0.1,
  sleepFrames: 14,
  /** A loose clod this slow and on the ground for settleFrames becomes ground. */
  settleSpeed: 0.8,
  settleFrames: 2,
  /** Closing speed above which clod-on-clod impacts stick instead of scattering. */
  stickSpeed: 1.8,
  wakeDepth: 0.15,
  maxSpeed: 7,
  absorbTolerance: 0.7,
  absorbPerFrame: 120,
  /** Released volume per second once the mouth faces down. */
  tipRate: 0.4,
};
/** What the solver needs from the plot and the machine. */
export interface SoilHost {
  machine: Machine;
  held: SoilClod[];
  falling: SoilClod[];
  surface(x: number, z: number): number;
  surfaceNormal(x: number, z: number, out: Float64Array): void;
  /** Give a settled clod's volume back to the ground; false keeps it loose. */
  absorb(clod: SoilClod): boolean;
  frameOf(m: Machine, out: Frame): void;
  /** Whether a loose clod may be counted as carried again. */
  canCapture(volume: number): boolean;
}
const lerpMachine = (a: Machine, b: Machine, t: number, out: Machine) => {
  out.x = a.x + (b.x - a.x) * t;
  out.z = a.z + (b.z - a.z) * t;
  out.heading = a.heading + (b.heading - a.heading) * t;
  out.swing = a.swing + (b.swing - a.swing) * t;
  out.boom = a.boom + (b.boom - a.boom) * t;
  out.stick = a.stick + (b.stick - a.stick) * t;
  out.bucket = a.bucket + (b.bucket - a.bucket) * t;
};

export class Soil {
  readonly r = CLOD_RADIUS;
  readonly shell = new BucketShell(CLOD_RADIUS);
  readonly capacity = SOIL.capacity;
  readonly px = new Float32Array(SOIL.capacity);
  readonly py = new Float32Array(SOIL.capacity);
  readonly pz = new Float32Array(SOIL.capacity);
  private ppx = new Float32Array(SOIL.capacity);
  private ppy = new Float32Array(SOIL.capacity);
  private ppz = new Float32Array(SOIL.capacity);
  private vx = new Float32Array(SOIL.capacity);
  private vy = new Float32Array(SOIL.capacity);
  private vz = new Float32Array(SOIL.capacity);
  private alive = new Uint8Array(SOIL.capacity);
  private awake = new Uint8Array(SOIL.capacity);
  private held = new Uint8Array(SOIL.capacity);
  private still = new Uint16Array(SOIL.capacity);
  private born = new Uint8Array(SOIL.capacity);
  /** Set when a clod touched anything this substep; only resting clods get settling damping. */
  private touching = new Uint8Array(SOIL.capacity);
  /** Frames a loose clod has spent slow and on the ground; soil that lands stays put. */
  private settle = new Uint8Array(SOIL.capacity);
  private stamp = new Uint32Array(SOIL.capacity);
  private objs: (SoilClod | null)[] = new Array(SOIL.capacity).fill(null);
  private index = new WeakMap<SoilClod, number>();
  private active = new Int32Array(SOIL.capacity);
  private slot = new Int32Array(SOIL.capacity).fill(-1);
  activeCount = 0;
  private free = new Int32Array(SOIL.capacity);
  private freeCount = SOIL.capacity;
  private generation = 0;
  // Hashed grid: cells are keyed by hash so the whole plot fits in one table.
  private cellSize: number;
  private cellStart = new Int32Array(65537);
  private cellFill = new Int32Array(65536);
  private entries = new Int32Array(SOIL.capacity);
  private cellOfClod = new Int32Array(SOIL.capacity);
  private pairs = new Int32Array(SOIL.capacity * 2 * 40);
  pairCount = 0;
  private pairsDirty = true;
  private bx = new Float32Array(SOIL.capacity);
  private by = new Float32Array(SOIL.capacity);
  private bz = new Float32Array(SOIL.capacity);
  private searchR2: number;
  private trigger2: number;
  private frameA = makeFrame();
  private frameB = makeFrame();
  /** Frame the held clods were last placed against; detects teleported poses. */
  lastFrame: Frame | null = null;
  private poseA: Machine;
  private poseB: Machine;
  private aabb = new Float64Array(6);
  private n3 = new Float64Array(3);
  private l3 = new Float64Array(3);
  private w3 = new Float64Array(3);
  private pressed = new Int32Array(256);
  private pressedCount = 0;
  physicsMs = 0;
  bucketMoved = false;
  constructor(private host: SoilHost) {
    for (let i = 0; i < SOIL.capacity; i++)
      this.free[i] = SOIL.capacity - 1 - i;
    const margin = 1.5 * this.r,
      search = 2 * this.r + SOIL.cohesionRange * this.r + margin;
    this.searchR2 = search * search;
    this.trigger2 = (margin / 2) * (margin / 2);
    this.cellSize = search;
    this.poseA = { ...host.machine };
    this.poseB = { ...host.machine };
  }
  /** Record that carried clods were positioned against the current pose. */
  anchor(m: Machine) {
    if (!this.lastFrame) this.lastFrame = makeFrame();
    this.host.frameOf(m, this.lastFrame);
  }
  private spawn(obj: SoilClod, heldNow: boolean) {
    if (this.freeCount === 0) return -1;
    const i = this.free[--this.freeCount];
    this.objs[i] = obj;
    this.index.set(obj, i);
    this.alive[i] = 1;
    this.awake[i] = obj.asleep ? 0 : 1;
    this.held[i] = heldNow ? 1 : 0;
    this.still[i] = 0;
    this.settle[i] = 0;
    this.born[i] = SOIL.substeps;
    this.vx[i] = obj.vx;
    this.vy[i] = obj.vy;
    this.vz[i] = obj.vz;
    this.px[i] = this.ppx[i] = obj.x;
    this.py[i] = this.ppy[i] = obj.y;
    this.pz[i] = this.ppz[i] = obj.z;
    this.slot[i] = this.activeCount;
    this.active[this.activeCount++] = i;
    this.pairsDirty = true;
    return i;
  }
  private remove(i: number) {
    if (!this.alive[i]) return;
    this.alive[i] = 0;
    this.awake[i] = 0;
    const obj = this.objs[i];
    if (obj) this.index.delete(obj);
    this.objs[i] = null;
    const s = this.slot[i],
      last = this.active[--this.activeCount];
    this.active[s] = last;
    this.slot[last] = s;
    this.slot[i] = -1;
    this.free[this.freeCount++] = i;
    this.pairsDirty = true;
  }
  private wakeStack = new Int32Array(SOIL.capacity);
  /** Wake a clod and everything sleeping on top of it, so nothing is left hanging. */
  private wake(i: number) {
    if (this.awake[i] || !this.alive[i]) return;
    this.awake[i] = 1;
    this.still[i] = 0;
    this.pairsDirty = true;
    const stack = this.wakeStack,
      lift = 0.3 * this.r,
      reach = 2.3 * this.r;
    let top = 0;
    stack[top++] = i;
    while (top > 0) {
      const j = stack[--top],
        y = this.py[j];
      this.forNeighbours(this.px[j], y, this.pz[j], reach, (k) => {
        if (this.awake[k] || this.py[k] <= y + lift || top >= stack.length)
          return;
        this.awake[k] = 1;
        this.still[k] = 0;
        stack[top++] = k;
      });
    }
  }
  private sleep(i: number) {
    this.awake[i] = 0;
    this.still[i] = 0;
    this.vx[i] = this.vy[i] = this.vz[i] = 0;
    this.ppx[i] = this.px[i];
    this.ppy[i] = this.py[i];
    this.ppz[i] = this.pz[i];
  }
  /** Mirror the host's clod objects into the pool, dropping any that vanished. */
  private importObjects() {
    const gen = ++this.generation;
    for (const list of [this.host.held, this.host.falling]) {
      const heldNow = list === this.host.held;
      for (const obj of list) {
        let i = this.index.get(obj);
        if (i === undefined || this.objs[i] !== obj) {
          i = this.spawn(obj, heldNow);
          if (i < 0) break;
        } else {
          if (
            this.px[i] !== obj.x ||
            this.py[i] !== obj.y ||
            this.pz[i] !== obj.z
          ) {
            // Moved from outside (dump, reload, tools): treat like a fresh placement.
            this.px[i] = this.ppx[i] = obj.x;
            this.py[i] = this.ppy[i] = obj.y;
            this.pz[i] = this.ppz[i] = obj.z;
            this.born[i] = SOIL.substeps;
            this.wake(i);
          }
          if (
            this.vx[i] !== obj.vx ||
            this.vy[i] !== obj.vy ||
            this.vz[i] !== obj.vz
          ) {
            // A nudge from the host (tipping) applies from this step on.
            this.vx[i] = obj.vx;
            this.vy[i] = obj.vy;
            this.vz[i] = obj.vz;
            this.born[i] = 0;
            this.wake(i);
          }
          if (this.held[i] !== (heldNow ? 1 : 0)) {
            this.held[i] = heldNow ? 1 : 0;
            this.wake(i);
          }
        }
        this.stamp[i] = gen;
      }
    }
    for (let k = this.activeCount - 1; k >= 0; k--) {
      const i = this.active[k];
      if (this.stamp[i] !== gen) this.remove(i);
    }
  }
  private exportObjects() {
    const held = this.host.held,
      falling = this.host.falling;
    held.length = 0;
    falling.length = 0;
    for (let k = 0; k < this.activeCount; k++) {
      const i = this.active[k],
        obj = this.objs[i]!;
      obj.x = this.px[i];
      obj.y = this.py[i];
      obj.z = this.pz[i];
      obj.vx = this.vx[i];
      obj.vy = this.vy[i];
      obj.vz = this.vz[i];
      obj.asleep = !this.awake[i];
      (this.held[i] ? held : falling).push(obj);
    }
  }
  /** Carry held clods along when the arm pose jumps rather than moves. */
  private carryTeleport() {
    const last = this.lastFrame;
    if (!last) return false;
    const f = this.frameA;
    const jump = Math.hypot(f[0] - last[0], f[1] - last[1], f[2] - last[2]);
    const turn = 1 - (f[6] * last[6] + f[7] * last[7] + f[8] * last[8]);
    if (jump < 0.35 && turn < 0.12) return false;
    const l = this.l3,
      w = this.w3;
    for (let k = 0; k < this.activeCount; k++) {
      const i = this.active[k];
      if (!this.held[i]) continue;
      toLocal(last, this.px[i], this.py[i], this.pz[i], l);
      toWorld(f, l[0], l[1], l[2], w);
      this.px[i] = this.ppx[i] = w[0];
      this.py[i] = this.ppy[i] = w[1];
      this.pz[i] = this.ppz[i] = w[2];
      this.vx[i] = this.vy[i] = this.vz[i] = 0;
      this.born[i] = SOIL.substeps;
      this.wake(i);
    }
    return true;
  }
  step(dt: number, before: Machine, after: Machine) {
    const t0 = typeof performance !== "undefined" ? performance.now() : 0;
    this.host.frameOf(before, this.frameA);
    this.host.frameOf(after, this.frameB);
    this.importObjects();
    if (this.carryTeleport()) {
      this.host.frameOf(after, this.frameA);
      Object.assign(this.poseA, after);
    } else Object.assign(this.poseA, before);
    Object.assign(this.poseB, after);
    if (!this.lastFrame) this.lastFrame = makeFrame();
    this.lastFrame.set(this.frameB);
    const fa = this.frameA,
      fb = this.frameB;
    this.bucketMoved =
      Math.abs(fa[0] - fb[0]) +
        Math.abs(fa[1] - fb[1]) +
        Math.abs(fa[2] - fb[2]) +
        Math.abs(fa[6] - fb[6]) +
        Math.abs(fa[7] - fb[7]) +
        Math.abs(fa[8] - fb[8]) +
        Math.abs(fa[9] - fb[9]) +
        Math.abs(fa[11] - fb[11]) >
      1e-7;
    this.shell.frame.set(fb);
    if (this.bucketMoved) this.wakeAround();
    const n = SOIL.substeps,
      h = dt / n,
      mid = { ...before };
    for (let k = 1; k <= n; k++) {
      lerpMachine(this.poseA, this.poseB, (k - 1) / n, mid);
      this.host.frameOf(mid, this.shell.prev);
      lerpMachine(this.poseA, this.poseB, k / n, mid);
      this.host.frameOf(mid, this.shell.frame);
      this.integrate(h);
      if (this.pairsDirty) this.buildPairs();
      this.solvePairs();
      this.solveBoundaries();
      this.finishVelocities(h);
    }
    this.shell.frame.set(fb);
    this.shell.prev.set(fb);
    this.updateSleep();
    this.transitions();
    this.absorb();
    this.exportObjects();
    this.physicsMs =
      typeof performance !== "undefined" ? performance.now() - t0 : 0;
  }
  private wakeAround() {
    const box = this.aabb;
    this.shell.aabb(4 * this.r, box);
    for (let k = 0; k < this.activeCount; k++) {
      const i = this.active[k];
      if (this.awake[i]) continue;
      const x = this.px[i],
        y = this.py[i],
        z = this.pz[i];
      if (
        x > box[0] &&
        x < box[1] &&
        y > box[2] &&
        y < box[3] &&
        z > box[4] &&
        z < box[5]
      )
        this.wake(i);
    }
  }
  private hashCell(x: number, y: number, z: number) {
    const cs = this.cellSize;
    const ix = Math.floor(x / cs),
      iy = Math.floor(y / cs),
      iz = Math.floor(z / cs);
    return this.hashKey(ix, iy, iz);
  }
  private hashKey(ix: number, iy: number, iz: number) {
    return (
      (Math.imul(ix, 73856093) ^
        Math.imul(iy, 19349663) ^
        Math.imul(iz, 83492791)) &
      0xffff
    );
  }
  private buildGrid() {
    const start = this.cellStart,
      fill = this.cellFill;
    start.fill(0);
    for (let k = 0; k < this.activeCount; k++) {
      const i = this.active[k],
        c = this.hashCell(this.px[i], this.py[i], this.pz[i]);
      this.cellOfClod[i] = c;
      start[c + 1]++;
    }
    for (let c = 1; c < start.length; c++) start[c] += start[c - 1];
    fill.set(start.subarray(0, fill.length));
    for (let k = 0; k < this.activeCount; k++) {
      const i = this.active[k];
      this.entries[fill[this.cellOfClod[i]]++] = i;
    }
  }
  private buildPairs() {
    this.buildGrid();
    const { px, py, pz, awake, cellStart: start, entries } = this;
    const cs = this.cellSize,
      r2 = this.searchR2,
      pairs = this.pairs,
      max = pairs.length - 2;
    let n = 0;
    for (let k = 0; k < this.activeCount; k++) {
      const i = this.active[k];
      if (!awake[i]) continue;
      this.bx[i] = px[i];
      this.by[i] = py[i];
      this.bz[i] = pz[i];
      const cx = Math.floor(px[i] / cs),
        cy = Math.floor(py[i] / cs),
        cz = Math.floor(pz[i] / cs);
      for (let dz = -1; dz <= 1; dz++)
        for (let dy = -1; dy <= 1; dy++)
          for (let dx = -1; dx <= 1; dx++) {
            const c = this.hashKey(cx + dx, cy + dy, cz + dz);
            for (let e = start[c], end = start[c + 1]; e < end; e++) {
              const j = entries[e];
              if (j === i || (awake[j] && j < i)) continue;
              const ddx = px[i] - px[j],
                ddy = py[i] - py[j],
                ddz = pz[i] - pz[j];
              if (ddx * ddx + ddy * ddy + ddz * ddz >= r2) continue;
              if (n > max) break;
              pairs[n++] = i;
              pairs[n++] = j;
            }
          }
    }
    this.pairCount = n / 2;
    this.pairsDirty = false;
  }
  private forNeighbours(
    x: number,
    y: number,
    z: number,
    reach: number,
    fn: (j: number) => void,
  ) {
    const cs = this.cellSize,
      cx = Math.floor(x / cs),
      cy = Math.floor(y / cs),
      cz = Math.floor(z / cs),
      reach2 = reach * reach;
    for (let dz = -1; dz <= 1; dz++)
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const c = this.hashKey(cx + dx, cy + dy, cz + dz);
          for (
            let e = this.cellStart[c], end = this.cellStart[c + 1];
            e < end;
            e++
          ) {
            const j = this.entries[e];
            if (!this.alive[j]) continue;
            const ex = this.px[j] - x,
              ey = this.py[j] - y,
              ez = this.pz[j] - z;
            if (ex * ex + ey * ey + ez * ez < reach2) fn(j);
          }
        }
  }
  private supported(j: number) {
    const r = this.r,
      x = this.px[j],
      y = this.py[j],
      z = this.pz[j];
    if (y - r - this.host.surface(x, z) < 0.6 * r) return true;
    if (this.held[j]) return true;
    let found = false;
    this.forNeighbours(x, y, z, 2.2 * r, (k) => {
      if (k !== j && this.py[k] < y - 0.5 * r) found = true;
    });
    return found;
  }
  private integrate(h: number) {
    const { px, py, pz, ppx, ppy, ppz, vx, vy, vz, awake, touching } = this;
    const g = SOIL.gravity * h,
      slow = (SOIL.sleepSpeed * 4) ** 2;
    for (let k = 0; k < this.activeCount; k++) {
      const i = this.active[k];
      if (!awake[i]) continue;
      ppx[i] = px[i];
      ppy[i] = py[i];
      ppz[i] = pz[i];
      vy[i] -= g;
      // Free-falling clods keep their speed; slow clods in contact settle quickly.
      let s = 0.998;
      if (touching[i] && vx[i] * vx[i] + vy[i] * vy[i] + vz[i] * vz[i] < slow)
        s = 0.9;
      touching[i] = 0;
      vx[i] *= s;
      vy[i] *= s;
      vz[i] *= s;
      px[i] += vx[i] * h;
      py[i] += vy[i] * h;
      pz[i] += vz[i] * h;
    }
  }
  private solvePairs() {
    const { px, py, pz, ppx, ppy, ppz, awake, pairs, born } = this;
    const r = this.r,
      dia = 2 * r,
      reach = dia + SOIL.cohesionRange * r,
      reach2 = reach * reach,
      muS = SOIL.soilStatic,
      muK = SOIL.soilKinetic,
      wakeDepth = SOIL.wakeDepth * r,
      deep = 0.5 * r,
      deepPrev2 = (dia - 0.4 * r) * (dia - 0.4 * r),
      impact = (SOIL.stickSpeed / SOIL.substeps) * (1 / 60),
      coh = SOIL.cohesion;
    for (let p = 0, end = this.pairCount * 2; p < end; p += 2) {
      const i = pairs[p],
        j = pairs[p + 1];
      if (!awake[i] && !awake[j]) continue;
      let dx = px[i] - px[j],
        dy = py[i] - py[j],
        dz = pz[i] - pz[j];
      const d2 = dx * dx + dy * dy + dz * dz;
      if (d2 >= reach2) continue;
      let d = Math.sqrt(d2);
      if (d < 1e-6) {
        dx = 1e-6;
        d = 1e-6;
      }
      const wi = awake[i],
        wj = awake[j],
        ws = wi + wj;
      const nx = dx / d,
        ny = dy / d,
        nz = dz / d,
        si = wi / ws,
        sj = wj / ws;
      if (d < dia) {
        const c = dia - d;
        this.touching[i] = this.touching[j] = 1;
        px[i] += nx * c * si;
        py[i] += ny * c * si;
        pz[i] += nz * c * si;
        px[j] -= nx * c * sj;
        py[j] -= ny * c * sj;
        pz[j] -= nz * c * sj;
        // Earth hitting earth sticks: on a fast impact the slower clod is moved
        // aside without picking up speed, so a landing stream does not splash.
        const mi = px[i] - ppx[i],
          ni = py[i] - ppy[i],
          oi = pz[i] - ppz[i],
          mj = px[j] - ppx[j],
          nj = py[j] - ppy[j],
          oj = pz[j] - ppz[j];
        const closing = (mj - mi) * nx + (nj - ni) * ny + (oj - oi) * nz;
        if (closing > impact) {
          const fastI =
            mi * mi + ni * ni + oi * oi > mj * mj + nj * nj + oj * oj;
          if (fastI && wj) {
            ppx[j] -= nx * c * sj;
            ppy[j] -= ny * c * sj;
            ppz[j] -= nz * c * sj;
          } else if (!fastI && wi) {
            ppx[i] += nx * c * si;
            ppy[i] += ny * c * si;
            ppz[i] += nz * c * si;
          }
        }
        if (c > deep || born[i] || born[j]) {
          // Overlaps that already existed, or involve a clod that was just placed,
          // are resolved as teleports so neither party is launched.
          const ex = ppx[i] - ppx[j],
            ey = ppy[i] - ppy[j],
            ez = ppz[i] - ppz[j];
          if (born[i] || born[j] || ex * ex + ey * ey + ez * ez < deepPrev2) {
            ppx[i] += nx * c * si;
            ppy[i] += ny * c * si;
            ppz[i] += nz * c * si;
            ppx[j] -= nx * c * sj;
            ppy[j] -= ny * c * sj;
            ppz[j] -= nz * c * sj;
          }
        }
        if (c > wakeDepth) {
          if (!wj) this.wake(j);
          if (!wi) this.wake(i);
        }
        let tx = px[i] - ppx[i] - (px[j] - ppx[j]),
          ty = py[i] - ppy[i] - (py[j] - ppy[j]),
          tz = pz[i] - ppz[i] - (pz[j] - ppz[j]);
        const tn = tx * nx + ty * ny + tz * nz;
        tx -= tn * nx;
        ty -= tn * ny;
        tz -= tn * nz;
        const tl = Math.sqrt(tx * tx + ty * ty + tz * tz);
        if (tl > 1e-9) {
          const f = tl < muS * c ? 1 : Math.min((muK * c) / tl, 1);
          px[i] -= tx * f * si;
          py[i] -= ty * f * si;
          pz[i] -= tz * f * si;
          px[j] += tx * f * sj;
          py[j] += ty * f * sj;
          pz[j] += tz * f * sj;
        }
      } else if (coh > 0) {
        const c = (d - dia) * coh;
        px[i] -= nx * c * si;
        py[i] -= ny * c * si;
        pz[i] -= nz * c * si;
        px[j] += nx * c * sj;
        py[j] += ny * c * sj;
        pz[j] += nz * c * sj;
      }
    }
  }
  private solveBoundaries() {
    const { px, py, pz, ppx, ppy, ppz, awake } = this;
    const r = this.r,
      host = this.host,
      n3 = this.n3,
      gS = SOIL.groundStatic,
      gK = SOIL.groundKinetic,
      liftLimit = 0.15 * r,
      xMax = 8.8 - r,
      zMax = 9.8 - r;
    for (let k = 0; k < this.activeCount; k++) {
      const i = this.active[k];
      if (!awake[i]) continue;
      if (px[i] < -xMax) px[i] = -xMax;
      else if (px[i] > xMax) px[i] = xMax;
      if (pz[i] < -zMax) pz[i] = -zMax;
      else if (pz[i] > zMax) pz[i] = zMax;
      const h = host.surface(px[i], pz[i]);
      if (py[i] - r < h) {
        this.touching[i] = 1;
        host.surfaceNormal(px[i], pz[i], n3);
        const c = (h - (py[i] - r)) * n3[1];
        px[i] += n3[0] * c;
        py[i] += n3[1] * c;
        pz[i] += n3[2] * c;
        if (
          c > liftLimit &&
          ppy[i] - r < host.surface(ppx[i], ppz[i]) - liftLimit
        ) {
          ppx[i] += n3[0] * c;
          ppy[i] += n3[1] * c;
          ppz[i] += n3[2] * c;
        }
        let dx = px[i] - ppx[i],
          dy = py[i] - ppy[i],
          dz = pz[i] - ppz[i];
        const dn = dx * n3[0] + dy * n3[1] + dz * n3[2];
        dx -= dn * n3[0];
        dy -= dn * n3[1];
        dz -= dn * n3[2];
        const tl = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (tl > 1e-9) {
          const f = tl < gS * c ? 1 : Math.min((gK * c) / tl, 1);
          px[i] -= dx * f;
          py[i] -= dy * f;
          pz[i] -= dz * f;
        }
      }
      const touched = this.shell.resolve(
        i,
        px,
        py,
        pz,
        ppx,
        ppy,
        ppz,
        r,
        SOIL.steelStatic,
        SOIL.steelKinetic,
      );
      if (touched) this.touching[i] = 1;
      // Squeezed between steel and ground: the bucket presses it into the terrain.
      if (
        touched &&
        !this.held[i] &&
        this.pressedCount < this.pressed.length &&
        py[i] - r < host.surface(px[i], pz[i]) - 0.5 * r
      )
        this.pressed[this.pressedCount++] = i;
    }
    for (let k = 0; k < this.pressedCount; k++) {
      const i = this.pressed[k];
      if (!this.alive[i]) continue;
      const obj = this.objs[i]!;
      obj.x = px[i];
      obj.y = py[i];
      obj.z = pz[i];
      if (host.absorb(obj)) this.remove(i);
    }
    this.pressedCount = 0;
  }
  private finishVelocities(h: number) {
    const { px, py, pz, ppx, ppy, ppz, vx, vy, vz, awake, bx, by, bz } = this;
    const inv = 1 / h,
      vmax2 = SOIL.maxSpeed * SOIL.maxSpeed,
      trig = this.trigger2;
    for (let k = 0; k < this.activeCount; k++) {
      const i = this.active[k];
      if (!awake[i]) continue;
      if (this.born[i]) {
        this.born[i]--;
        vx[i] = vy[i] = vz[i] = 0;
        bx[i] = px[i];
        by[i] = py[i];
        bz[i] = pz[i];
        this.pairsDirty = true;
        continue;
      }
      let x = (px[i] - ppx[i]) * inv,
        y = (py[i] - ppy[i]) * inv,
        z = (pz[i] - ppz[i]) * inv;
      const s2 = x * x + y * y + z * z;
      if (s2 > vmax2) {
        const s = Math.sqrt(vmax2 / s2);
        x *= s;
        y *= s;
        z *= s;
        px[i] = ppx[i] + x * h;
        py[i] = ppy[i] + y * h;
        pz[i] = ppz[i] + z * h;
      }
      vx[i] = x;
      vy[i] = y;
      vz[i] = z;
      const dx = px[i] - bx[i],
        dy = py[i] - by[i],
        dz = pz[i] - bz[i];
      if (dx * dx + dy * dy + dz * dz > trig) this.pairsDirty = true;
    }
  }
  private updateSleep() {
    const { vx, vy, vz, awake, still, settle } = this;
    const thr = SOIL.sleepSpeed * SOIL.sleepSpeed,
      landed = SOIL.settleSpeed * SOIL.settleSpeed,
      r = this.r,
      tol = SOIL.absorbTolerance * r;
    for (let k = 0; k < this.activeCount; k++) {
      const i = this.active[k];
      if (!awake[i]) continue;
      const v2 = vx[i] * vx[i] + vy[i] * vy[i] + vz[i] * vz[i];
      if (v2 < thr) {
        if (++still[i] >= SOIL.sleepFrames) this.sleep(i);
      } else still[i] = 0;
      if (
        !this.held[i] &&
        v2 < landed &&
        this.py[i] - r - this.host.surface(this.px[i], this.pz[i]) < tol
      ) {
        if (settle[i] < 255) settle[i]++;
      } else settle[i] = 0;
    }
  }
  /** Carried clods that leave the bowl become loose; loose clods landing in it are carried. */
  private transitions() {
    const shell = this.shell,
      l = this.l3,
      r = this.r,
      f = shell.frame,
      up = shell.mouthWorldUp(),
      openingUp = up > 0.3;
    for (let k = 0; k < this.activeCount; k++) {
      const i = this.active[k];
      toLocal(f, this.px[i], this.py[i], this.pz[i], l);
      if (this.held[i]) {
        // An inverted bowl supports nothing; otherwise the clod must still be in it.
        if (up < -0.05 || !shell.contains(l[0], l[1], l[2], 1.5 * r)) {
          this.held[i] = 0;
          this.host.machine.load = Math.max(
            0,
            this.host.machine.load - this.objs[i]!.volume,
          );
          this.wake(i);
          if (this.host.machine.load < 1e-9) this.host.machine.load = 0;
        }
      } else if (
        this.awake[i] &&
        openingUp &&
        shell.contains(l[0], l[1], l[2], -0.5 * r) &&
        this.host.canCapture(this.objs[i]!.volume)
      ) {
        this.held[i] = 1;
        this.host.machine.load += this.objs[i]!.volume;
      }
    }
  }
  /** Return settled loose clods that rest on the ground to the grid. */
  private absorb() {
    const r = this.r,
      tol = SOIL.absorbTolerance * r,
      host = this.host;
    let n = 0;
    for (let k = this.activeCount - 1; k >= 0 && n < SOIL.absorbPerFrame; k--) {
      const i = this.active[k];
      if (this.held[i]) continue;
      if (this.awake[i] && this.settle[i] < SOIL.settleFrames) continue;
      const x = this.px[i],
        y = this.py[i],
        z = this.pz[i];
      if (y - r - host.surface(x, z) > tol) continue;
      const obj = this.objs[i]!;
      obj.x = x;
      obj.y = y;
      obj.z = z;
      if (!host.absorb(obj)) continue;
      this.remove(i);
      n++;
      this.forNeighbours(x, y, z, 2.3 * r, (j) => {
        if (!this.awake[j] && !this.supported(j)) this.wake(j);
      });
    }
  }
  /** Volume held by carried clods according to the pool (diagnostics). */
  heldCount() {
    let n = 0;
    for (let k = 0; k < this.activeCount; k++) n += this.held[this.active[k]];
    return n;
  }
  awakeCount() {
    let n = 0;
    for (let k = 0; k < this.activeCount; k++) n += this.awake[this.active[k]];
    return n;
  }
}
