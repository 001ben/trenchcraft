/**
 * Collision shell for the authored scoop, expressed in the Bucket joint's own
 * coordinates: x runs across the width, y is up when the bucket is level, and z
 * runs from the rolled heel (negative) out to the cutting lip (positive). The
 * outline is sampled from the same quadratic curves that build the Blender
 * shell, so clods feel the surface the player sees. A frame maps these local
 * coordinates to the world for the current arm pose.
 */

/** origin xyz, then the local x, y and z axes in world space. */
export type Frame = Float64Array;
export const makeFrame = (): Frame => {
  const f = new Float64Array(12);
  f[3] = f[7] = f[11] = 1;
  return f;
};
export function toWorld(
  f: Frame,
  lx: number,
  ly: number,
  lz: number,
  out: Float64Array,
) {
  out[0] = f[0] + lx * f[3] + ly * f[6] + lz * f[9];
  out[1] = f[1] + lx * f[4] + ly * f[7] + lz * f[10];
  out[2] = f[2] + lx * f[5] + ly * f[8] + lz * f[11];
}
export function toLocal(
  f: Frame,
  wx: number,
  wy: number,
  wz: number,
  out: Float64Array,
) {
  const dx = wx - f[0],
    dy = wy - f[1],
    dz = wz - f[2];
  out[0] = dx * f[3] + dy * f[4] + dz * f[5];
  out[1] = dx * f[6] + dy * f[7] + dz * f[8];
  out[2] = dx * f[9] + dy * f[10] + dz * f[11];
}

// Blender authoring: local -Y is the mouth; glTF maps Blender (y, z) to (-z, y) here.
const SEGMENTS: [number, number][][] = [
  [
    [0.14, 0.08],
    [0.24, -0.13],
    [0.1, -0.32],
  ],
  [
    [0.1, -0.32],
    [-0.06, -0.55],
    [-0.32, -0.48],
  ],
  [
    [-0.32, -0.48],
    [-0.51, -0.44],
    [-0.62, -0.35],
  ],
];
/** Outer shell outline as (u = local z, v = local y) pairs from the heel top to the lip. */
export const OUTLINE = (() => {
  const pts: number[] = [];
  for (const [a, c, b] of SEGMENTS)
    for (let j = 0; j < 6; j++) {
      const t = j / 6,
        w0 = (1 - t) * (1 - t),
        w1 = 2 * t * (1 - t),
        w2 = t * t;
      pts.push(
        -(w0 * a[0] + w1 * c[0] + w2 * b[0]),
        w0 * a[1] + w1 * c[1] + w2 * b[1],
      );
    }
  const last = SEGMENTS[SEGMENTS.length - 1][2];
  pts.push(-last[0], last[1]);
  return Float64Array.from(pts);
})();
export const PLATE = 0.045;
/** Inside face of the side plates. */
export const HALF_WIDTH = 0.3675;
export const CHEEK_OUTER = 0.4125;
export const BACK_U = OUTLINE[0],
  BACK_V = OUTLINE[1],
  LIP_U = OUTLINE[OUTLINE.length - 2],
  LIP_V = OUTLINE[OUTLINE.length - 1],
  TOOTH_U = 0.7;
const mouthLen = Math.hypot(LIP_U - BACK_U, LIP_V - BACK_V);
/** Unit normal of the mouth plane pointing out of the bucket. */
export const MOUTH_NU = -(LIP_V - BACK_V) / mouthLen,
  MOUTH_NV = (LIP_U - BACK_U) / mouthLen;
/** Height above the mouth plane; negative is inside the bowl. */
export const mouthHeight = (u: number, v: number) =>
  (u - BACK_U) * MOUTH_NU + (v - BACK_V) * MOUTH_NV;

/** Inward normals per outline segment (the bowl is on the left of the heel-to-lip walk). */
const INNER = (() => {
  const n = OUTLINE.length / 2,
    normals = new Float64Array(OUTLINE.length);
  for (let i = 0; i < n - 1; i++) {
    const du = OUTLINE[2 * i + 2] - OUTLINE[2 * i],
      dv = OUTLINE[2 * i + 3] - OUTLINE[2 * i + 1],
      l = Math.hypot(du, dv) || 1;
    normals[2 * i] = -dv / l;
    normals[2 * i + 1] = du / l;
  }
  normals[2 * n - 2] = normals[2 * n - 4];
  normals[2 * n - 1] = normals[2 * n - 3];
  return normals;
})();
/** Plate centreline: the outline moved half a plate inward. */
const CENTER = (() => {
  const c = new Float64Array(OUTLINE.length);
  for (let i = 0; i < OUTLINE.length; i += 2) {
    c[i] = OUTLINE[i] + INNER[i] * (PLATE / 2);
    c[i + 1] = OUTLINE[i + 1] + INNER[i + 1] * (PLATE / 2);
  }
  return c;
})();
/** Inside floor height at a depth u, from the lower branch of the inner face. */
export function floorV(u: number) {
  let best = Infinity,
    v = -0.28;
  for (let i = 0; i < OUTLINE.length - 2; i += 2) {
    const u0 = OUTLINE[i] + INNER[i] * PLATE,
      u1 = OUTLINE[i + 2] + INNER[i + 2] * PLATE;
    if (u1 <= u0) continue; // the rolled heel; only the forward-running branch is floor
    if (u < u0 - 1e-9 || u > u1 + 1e-9) {
      const d = u < u0 ? u0 - u : u - u1;
      if (d < best) {
        best = d;
        v =
          u < u0
            ? OUTLINE[i + 1] + INNER[i + 1] * PLATE
            : OUTLINE[i + 3] + INNER[i + 3] * PLATE;
      }
      continue;
    }
    const t = (u - u0) / (u1 - u0);
    return (
      OUTLINE[i + 1] +
      INNER[i + 1] * PLATE +
      t *
        (OUTLINE[i + 3] +
          INNER[i + 3] * PLATE -
          OUTLINE[i + 1] -
          INNER[i + 1] * PLATE)
    );
  }
  return v;
}

export interface Prism {
  poly: Float64Array;
  nrm: Float64Array;
  z0: number;
  z1: number;
}
export interface Query {
  dist: number;
  nx: number;
  ny: number;
  nz: number;
  cx: number;
  cy: number;
  cz: number;
}
export const makeQuery = (): Query => ({
  dist: Infinity,
  nx: 0,
  ny: 1,
  nz: 0,
  cx: 0,
  cy: 0,
  cz: 0,
});
function makePrism(points: number[], z0: number, z1: number): Prism {
  const poly = Float64Array.from(points),
    n = poly.length / 2,
    nrm = new Float64Array(poly.length);
  for (let e = 0; e < n; e++) {
    const ax = poly[2 * e],
      ay = poly[2 * e + 1],
      bx = poly[(2 * e + 2) % poly.length],
      by = poly[(2 * e + 3) % poly.length];
    const dx = bx - ax,
      dy = by - ay,
      l = Math.hypot(dx, dy) || 1;
    nrm[2 * e] = dy / l;
    nrm[2 * e + 1] = -dx / l;
  }
  return { poly, nrm, z0, z1 };
}
/** Convex hull (counter-clockwise) of x,y pairs. */
function hull(points: number[]) {
  const p: [number, number][] = [];
  for (let i = 0; i < points.length; i += 2) p.push([points[i], points[i + 1]]);
  p.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o: number[], a: number[], b: number[]) =>
    (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower: [number, number][] = [];
  for (const q of p) {
    while (
      lower.length >= 2 &&
      cross(lower[lower.length - 2], lower[lower.length - 1], q) <= 0
    )
      lower.pop();
    lower.push(q);
  }
  const upper: [number, number][] = [];
  for (let i = p.length - 1; i >= 0; i--) {
    const q = p[i];
    while (
      upper.length >= 2 &&
      cross(upper[upper.length - 2], upper[upper.length - 1], q) <= 0
    )
      upper.pop();
    upper.push(q);
  }
  upper.pop();
  lower.pop();
  return lower.concat(upper).flat();
}
/** Signed distance, escape normal and closest point for a sphere centre against a convex prism. */
export function prismQuery(
  pr: Prism,
  x: number,
  y: number,
  z: number,
  q: Query,
) {
  const poly = pr.poly,
    nrm = pr.nrm,
    n = poly.length / 2;
  let maxSd = -Infinity,
    best = 0;
  for (let e = 0; e < n; e++) {
    const sd =
      nrm[2 * e] * (x - poly[2 * e]) + nrm[2 * e + 1] * (y - poly[2 * e + 1]);
    if (sd > maxSd) {
      maxSd = sd;
      best = e;
    }
  }
  let dxy: number, dirx: number, diry: number, qx: number, qy: number;
  if (maxSd <= 0) {
    dxy = maxSd;
    dirx = nrm[2 * best];
    diry = nrm[2 * best + 1];
    qx = x - dirx * maxSd;
    qy = y - diry * maxSd;
  } else {
    let bestD2 = Infinity;
    qx = x;
    qy = y;
    for (let e = 0; e < n; e++) {
      if (
        nrm[2 * e] * (x - poly[2 * e]) +
          nrm[2 * e + 1] * (y - poly[2 * e + 1]) <=
        0
      )
        continue;
      const ax = poly[2 * e],
        ay = poly[2 * e + 1],
        bx = poly[(2 * e + 2) % poly.length],
        by = poly[(2 * e + 3) % poly.length];
      const ex = bx - ax,
        ey = by - ay,
        l2 = ex * ex + ey * ey || 1;
      let t = ((x - ax) * ex + (y - ay) * ey) / l2;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const px = ax + ex * t,
        py = ay + ey * t,
        d2 = (x - px) * (x - px) + (y - py) * (y - py);
      if (d2 < bestD2) {
        bestD2 = d2;
        qx = px;
        qy = py;
        best = e;
      }
    }
    dxy = Math.sqrt(bestD2);
    if (dxy > 1e-9) {
      dirx = (x - qx) / dxy;
      diry = (y - qy) / dxy;
    } else {
      dirx = nrm[2 * best];
      diry = nrm[2 * best + 1];
    }
  }
  const insideZ = z >= pr.z0 && z <= pr.z1;
  let dz: number, zdir: number;
  if (insideZ) {
    const a = z - pr.z0,
      b = pr.z1 - z;
    if (a < b) {
      dz = a;
      zdir = -1;
    } else {
      dz = b;
      zdir = 1;
    }
  } else if (z < pr.z0) {
    dz = pr.z0 - z;
    zdir = -1;
  } else {
    dz = z - pr.z1;
    zdir = 1;
  }
  if (maxSd > 0 && !insideZ) {
    const d = Math.sqrt(dxy * dxy + dz * dz);
    q.dist = d;
    q.nx = (dirx * dxy) / d;
    q.ny = (diry * dxy) / d;
    q.nz = (zdir * dz) / d;
    q.cx = qx;
    q.cy = qy;
    q.cz = z - zdir * dz;
  } else if (maxSd > 0) {
    q.dist = dxy;
    q.nx = dirx;
    q.ny = diry;
    q.nz = 0;
    q.cx = qx;
    q.cy = qy;
    q.cz = z;
  } else if (!insideZ) {
    q.dist = dz;
    q.nx = 0;
    q.ny = 0;
    q.nz = zdir;
    q.cx = x;
    q.cy = y;
    q.cz = z - zdir * dz;
  } else if (-maxSd <= dz) {
    q.dist = maxSd;
    q.nx = dirx;
    q.ny = diry;
    q.nz = 0;
    q.cx = qx;
    q.cy = qy;
    q.cz = z;
  } else {
    q.dist = -dz;
    q.nx = 0;
    q.ny = 0;
    q.nz = zdir;
    q.cx = x;
    q.cy = y;
    q.cz = z + zdir * dz;
  }
}

/** Heaped soil may rise this far above the mouth plane and still count as carried. */
export const HEAP = 0.3;

export class BucketShell {
  frame = makeFrame();
  prev = makeFrame();
  readonly cheeks: Prism[];
  readonly lip: Prism;
  private q = makeQuery();
  private local = new Float64Array(3);
  private before = new Float64Array(3);
  private prevLocal = new Float64Array(3);
  /** Resting slots inside the bowl, layer by layer from the lip inward (x, y, z triples). */
  readonly lattice: Float64Array;
  readonly latticeCount: number;
  constructor(readonly r: number) {
    const outline = hull(Array.from(OUTLINE));
    this.cheeks = [
      makePrism(outline, HALF_WIDTH, CHEEK_OUTER),
      makePrism(outline, -CHEEK_OUTER, -HALF_WIDTH),
    ];
    this.lip = makePrism(
      [
        LIP_U - 0.07,
        LIP_V - 0.03,
        TOOTH_U,
        LIP_V - 0.03,
        TOOTH_U,
        LIP_V + 0.03,
        LIP_U - 0.07,
        LIP_V + 0.03,
      ],
      -0.41,
      0.41,
    );
    const slots: number[] = [],
      step = r * 2.02;
    for (let layer = 0; layer < 14; layer++) {
      const lift = layer * r * 1.75,
        offset = layer % 2 ? step / 2 : 0;
      for (let u = LIP_U - 0.08 - offset; u > -0.06; u -= step)
        for (let x = -HALF_WIDTH + r + offset; x < HALF_WIDTH - r; x += step) {
          const v = floorV(u) + r + lift;
          if (mouthHeight(u, v) > HEAP - r) continue;
          slots.push(x, v, u);
        }
    }
    this.lattice = Float64Array.from(slots);
    this.latticeCount = slots.length / 3;
  }
  /** World box around the shell for the current frame, expanded by margin. */
  aabb(margin: number, out: Float64Array) {
    let x0 = Infinity,
      x1 = -Infinity,
      y0 = Infinity,
      y1 = -Infinity,
      z0 = Infinity,
      z1 = -Infinity;
    const p = this.local;
    for (const w of [-CHEEK_OUTER, CHEEK_OUTER])
      for (const [u, v] of [
        [BACK_U - 0.08, BACK_V + HEAP],
        [TOOTH_U, LIP_V + HEAP],
        [TOOTH_U, LIP_V - 0.05],
        [0.1, -0.56],
        [-0.25, -0.35],
        [-0.25, BACK_V + HEAP],
      ]) {
        toWorld(this.frame, w, v, u, p);
        if (p[0] < x0) x0 = p[0];
        if (p[0] > x1) x1 = p[0];
        if (p[1] < y0) y0 = p[1];
        if (p[1] > y1) y1 = p[1];
        if (p[2] < z0) z0 = p[2];
        if (p[2] > z1) z1 = p[2];
      }
    out[0] = x0 - margin;
    out[1] = x1 + margin;
    out[2] = y0 - margin;
    out[3] = y1 + margin;
    out[4] = z0 - margin;
    out[5] = z1 + margin;
  }
  /**
   * Signed clearance from the shell wall in the u/v plane: positive on the bowl
   * side, negative behind or below the plate. Writes the closest centreline
   * point and the direction from it into out (cu, cv, du, dv, distance).
   */
  wall(u: number, v: number, out: Float64Array) {
    let best = Infinity,
      cu = 0,
      cv = 0,
      seg = 0;
    for (let i = 0; i < CENTER.length - 2; i += 2) {
      const ax = CENTER[i],
        ay = CENTER[i + 1],
        ex = CENTER[i + 2] - ax,
        ey = CENTER[i + 3] - ay,
        l2 = ex * ex + ey * ey || 1;
      let t = ((u - ax) * ex + (v - ay) * ey) / l2;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const px = ax + ex * t,
        py = ay + ey * t,
        d2 = (u - px) * (u - px) + (v - py) * (v - py);
      if (d2 < best) {
        best = d2;
        cu = px;
        cv = py;
        seg = i;
      }
    }
    const d = Math.sqrt(best);
    let du: number, dv: number;
    if (d > 1e-9) {
      du = (u - cu) / d;
      dv = (v - cv) / d;
    } else {
      du = INNER[seg];
      dv = INNER[seg + 1];
    }
    out[0] = cu;
    out[1] = cv;
    out[2] = du;
    out[3] = dv;
    out[4] = d;
    return du * INNER[seg] + dv * INNER[seg + 1] >= 0 ? d : -d;
  }
  /** World-space upward component of the mouth's outward normal (1 = opening straight up). */
  mouthWorldUp() {
    const f = this.frame;
    return MOUTH_NV * f[7] + MOUTH_NU * f[10];
  }
  /** True when a local point sits in the bowl or its allowed heap. */
  contains(lx: number, ly: number, lz: number, margin: number) {
    if (Math.abs(lx) > HALF_WIDTH + margin) return false;
    if (lz > TOOTH_U + margin || lz < BACK_U - 0.1 - margin) return false;
    if (mouthHeight(lz, ly) > HEAP + margin) return false;
    return this.wall(lz, ly, this.scratch) > -margin - PLATE / 2;
  }
  private scratch = new Float64Array(5);
  /**
   * Push one clod out of the plate, cheeks and lip it overlaps and apply Coulomb
   * friction against the wall's motion since the previous frame. Returns true
   * on contact.
   */
  resolve(
    i: number,
    px: Float32Array,
    py: Float32Array,
    pz: Float32Array,
    ppx: Float32Array,
    ppy: Float32Array,
    ppz: Float32Array,
    r: number,
    muS: number,
    muK: number,
  ) {
    const f = this.frame,
      l = this.local;
    toLocal(f, px[i], py[i], pz[i], l);
    const lx = l[0],
      ly = l[1],
      lz = l[2];
    if (
      Math.abs(lx) > CHEEK_OUTER + r ||
      lz < -0.3 - r ||
      lz > TOOTH_U + r ||
      ly < -0.62 - r ||
      ly > BACK_V + 0.1 + r
    )
      return false;
    let touched = false;
    // Plate wall, present across the full width between the side plates.
    if (Math.abs(lx) <= CHEEK_OUTER) {
      const w = this.scratch;
      const signed = this.wall(lz, ly, w);
      let pen = r + PLATE / 2 - w[4],
        nu = w[2],
        nv = w[3];
      if (signed < 0 && signed > -2.5 * r) {
        // Crossed the thin plate since last substep? Send it back to the bowl side.
        const p = this.prevLocal;
        toLocal(f, ppx[i], ppy[i], ppz[i], p);
        if (this.wall(p[2], p[1], w) > 0) {
          pen = r + PLATE / 2 - signed;
          nu = -w[2];
          nv = -w[3];
          this.wall(lz, ly, w);
          nu = -w[2];
          nv = -w[3];
        }
      }
      if (pen > 0) {
        touched = true;
        this.push(
          i,
          px,
          py,
          pz,
          ppx,
          ppy,
          ppz,
          lx,
          ly,
          lz,
          0,
          nv,
          nu,
          pen,
          muS,
          muK,
        );
      }
    }
    const q = this.q;
    if (Math.abs(lx) > HALF_WIDTH - r)
      for (const cheek of this.cheeks) {
        prismQuery(cheek, lz, ly, lx, q);
        const pen = r - q.dist;
        if (pen <= 0) continue;
        touched = true;
        this.push(
          i,
          px,
          py,
          pz,
          ppx,
          ppy,
          ppz,
          lx,
          ly,
          lz,
          q.nz,
          q.ny,
          q.nx,
          pen,
          muS,
          muK,
        );
      }
    if (lz > LIP_U - 0.12) {
      prismQuery(this.lip, lz, ly, lx, q);
      const pen = r - q.dist;
      if (pen > 0) {
        touched = true;
        this.push(
          i,
          px,
          py,
          pz,
          ppx,
          ppy,
          ppz,
          lx,
          ly,
          lz,
          q.nz,
          q.ny,
          q.nx,
          pen,
          muS,
          muK,
        );
      }
    }
    return touched;
  }
  /** Apply a local-space normal correction plus wall-relative friction. */
  private push(
    i: number,
    px: Float32Array,
    py: Float32Array,
    pz: Float32Array,
    ppx: Float32Array,
    ppy: Float32Array,
    ppz: Float32Array,
    lx: number,
    ly: number,
    lz: number,
    nx: number,
    ny: number,
    nz: number,
    pen: number,
    muS: number,
    muK: number,
  ) {
    const f = this.frame;
    const wx = nx * f[3] + ny * f[6] + nz * f[9],
      wy = nx * f[4] + ny * f[7] + nz * f[10],
      wz = nx * f[5] + ny * f[8] + nz * f[11];
    px[i] += wx * pen;
    py[i] += wy * pen;
    pz[i] += wz * pen;
    // Where this local point was last frame tells us how the wall moved.
    const b = this.before;
    toWorld(this.prev, lx, ly, lz, b);
    const now = this.local;
    toWorld(f, lx, ly, lz, now);
    let dx = px[i] - ppx[i] - (now[0] - b[0]),
      dy = py[i] - ppy[i] - (now[1] - b[1]),
      dz = pz[i] - ppz[i] - (now[2] - b[2]);
    const dn = dx * wx + dy * wy + dz * wz;
    dx -= dn * wx;
    dy -= dn * wy;
    dz -= dn * wz;
    const tl = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (tl > 1e-9) {
      const k = tl < muS * pen ? 1 : Math.min((muK * pen) / tl, 1);
      px[i] -= dx * k;
      py[i] -= dy * k;
      pz[i] -= dz * k;
    }
  }
  /**
   * Resting positions inside the bowl for n clods, in fill order (local x, y, z
   * triples). Slots past the lattice stack above its last layer.
   */
  restPositions(n: number, r: number, out: Float64Array) {
    void r;
    for (let k = 0; k < n; k++) this.slot(k, out, k * 3);
    return n;
  }
  /** Local position of fill slot k. */
  slot(k: number, out: Float64Array, o = 0) {
    const L = this.lattice,
      last = this.latticeCount - 1;
    if (k <= last) {
      out[o] = L[k * 3];
      out[o + 1] = L[k * 3 + 1];
      out[o + 2] = L[k * 3 + 2];
    } else {
      const extra = k - last,
        i = ((extra * 7) % (last + 1)) * 3;
      out[o] = L[i];
      out[o + 1] = L[i + 1] + this.r * 2 * (1 + Math.floor(extra / 40));
      out[o + 2] = L[i + 2];
    }
  }
}
