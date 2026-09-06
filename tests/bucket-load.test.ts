import test from "node:test";
import assert from "node:assert/strict";
import { BucketLoad, SOIL_COLS, SOIL_ROWS, soilZ } from "../src/bucket-load";
import { Simulation, CAPACITY, CELL, cellPosition } from "../src/simulation";

const bite = { x: 0, z: -3, top: 0, bottom: -0.1, across: 0, volume: 0.04 };
const center = (bed: BucketLoad) =>
  bed.amounts.reduce(
    (sum, v, i) => sum + v * soilZ(Math.floor(i / SOIL_COLS)),
    0,
  ) / bed.volume;
test("captured earth enters at the lip and rolls back under gravity when curled", () => {
  const bed = new BucketLoad();
  bed.update(0.04, [bite], 0, 0);
  const entry = center(bed);
  assert.ok(entry > 0.48);
  for (let i = 0; i < 120; i++) bed.update(0.04, [], -0.8, 1 / 60);
  assert.ok(
    center(bed) < entry - 0.15,
    "curl changes the gravity direction inside the bowl",
  );
  assert.ok(Math.abs(bed.volume - 0.04) < 1e-10);
});
test("bucket bed stays bounded, nonnegative and volume matched through loading and discharge", () => {
  const bed = new BucketLoad();
  for (let i = 0; i < 900; i++) {
    const load =
      i < 450
        ? Math.min(CAPACITY, i * 0.0007)
        : Math.max(0, CAPACITY - (i - 450) * 0.001);
    bed.update(
      load,
      [{ ...bite, across: Math.sin(i) * 0.3, volume: 0.0007 }],
      Math.sin(i * 0.01),
      1 / 60,
    );
    assert.ok(Math.abs(bed.volume - load) < 1e-9);
    assert.ok(bed.amounts.every((v) => v >= 0 && Number.isFinite(v)));
    assert.equal(bed.amounts.length, SOIL_COLS * SOIL_ROWS);
  }
  assert.equal(bed.volume, 0);
});
test("cut records are actual removed volume across the rotated bucket width, not decorative dust", () => {
  for (const yaw of [0, Math.PI / 2, 0.7]) {
    const sim = new Simulation();
    sim.machine.swing = yaw;
    sim.dig({ x: 0, y: -0.6, z: -3 }, 0.1);
    assert.ok(sim.cuts.length > 0);
    assert.equal(sim.dust.length, 0);
    assert.ok(
      Math.abs(sim.cuts.reduce((s, p) => s + p.volume, 0) - sim.machine.load) <
        1e-9,
    );
    for (const p of sim.cuts) {
      assert.ok(Math.abs(p.across) <= 0.39);
      assert.ok(p.top > p.bottom);
    }
    for (let i = 0; i < sim.ground.length; i++)
      if (sim.ground[i] < 0) {
        const p = cellPosition(i),
          ahead = p.x * Math.sin(yaw) + (p.z + 3) * Math.cos(yaw);
        assert.ok(Math.abs(ahead) <= 0.19);
      }
    assert.ok(
      Math.abs(
        sim.ground.reduce((s, h) => s + h * CELL * CELL, 0) + sim.machine.load,
      ) < 1e-9,
    );
    for (let i = 0; i < 200; i++) sim.dig({ x: 0, y: -1, z: -3 }, 0.016);
    assert.ok(sim.cuts.length <= 64);
  }
});

test("a stationary cutting lip removes nothing and a longer sweep removes proportionally more", () => {
  const a = new Simulation(),
    b = new Simulation(),
    c = new Simulation(),
    point = { x: 0, y: -0.1, z: -3 };
  assert.equal(a.dig(point, 1 / 60, 0), 0);
  const short = b.dig(point, 1 / 60, 0.005),
    long = c.dig(point, 1 / 60, 0.01);
  assert.ok(Math.abs(long / short - 2) < 1e-5);
});
