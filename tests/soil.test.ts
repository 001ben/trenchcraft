import test from "node:test";
import assert from "node:assert/strict";
import {
  Simulation,
  CAPACITY,
  CELL,
  cellPosition,
  neutral,
  parseSave,
  tooth,
  frameOf,
  spoil,
} from "../src/simulation";
import { makeFrame, toLocal, TOOTH_U, HALF_WIDTH } from "../src/bucket-shell";
import { CLOD_VOLUME } from "../src/soil";

const volume = (s: Simulation) =>
  s.ground.reduce((sum, h) => sum + h * CELL * CELL, 0) +
  s.machine.load +
  s.falling.reduce((sum, p) => sum + p.volume, 0);
const heldVolume = (s: Simulation) => s.held.reduce((a, p) => a + p.volume, 0);
const run = (
  s: Simulation,
  c: Partial<ReturnType<typeof neutral>>,
  frames: number,
) => {
  for (let i = 0; i < frames; i++) s.update({ ...neutral(), ...c }, 1 / 60);
};

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

test("cut earth surfaces from the cut column and its clods sum exactly to the load", () => {
  const s = new Simulation();
  for (let i = 0; i < 300; i++) s.dig({ x: 0, y: -0.7, z: -3 }, 1 / 60);
  assert.ok(Math.abs(s.machine.load - CAPACITY) < 1e-6);
  assert.ok(Math.abs(heldVolume(s) - s.machine.load) < 1e-9);
  assert.ok(s.held.length > 500, `${s.held.length} clods for a full bucket`);
  for (const clod of s.held) {
    assert.ok(
      clod.pending,
      "cut earth waits at the bank until the bowl sweeps it in",
    );
    assert.ok(
      Math.hypot(clod.x, clod.z + 3) < 0.65,
      "clod surfaces where the teeth cut",
    );
    assert.ok(
      clod.y > -0.9 && clod.y < 0.2,
      "clod surfaces from the cut column",
    );
  }
  assert.equal(s.falling.length, 0);
});

test("a full bucket carries its clods through a lift and swing, and the load is exact", () => {
  const s = new Simulation();
  run(s, { ry: -1 }, 32);
  run(s, { rx: -1, ly: 1 }, 70);
  const loaded = s.machine.load,
    count = s.held.length;
  assert.ok(loaded > 0.008, `only ${loaded} loaded`);
  assert.ok(Math.abs(heldVolume(s) - loaded) < 1e-9);
  run(s, { ry: 1, rx: -1 }, 70);
  run(s, { lx: 1 }, 90);
  run(s, {}, 30);
  // Cut earth that the curl did not sweep in stays on the bank; the rest rides along.
  assert.ok(
    s.machine.load >= loaded * 0.6,
    `only ${s.machine.load} of ${loaded} made it into the bowl and through the swing`,
  );
  assert.ok(s.held.length >= count * 0.6);
  assert.ok(
    s.held.every((c) => !c.pending),
    "everything still counted as load is really in the bowl",
  );
  assert.ok(Math.abs(volume(s)) < 1e-6, "soil volume drifted");
  const frame = makeFrame(),
    local = new Float64Array(3);
  frameOf(s.machine, frame);
  let inside = 0;
  for (const clod of s.held) {
    toLocal(frame, clod.x, clod.y, clod.z, local);
    if (Math.abs(local[0]) < HALF_WIDTH + 0.05 && local[2] < TOOTH_U + 0.05)
      inside++;
  }
  assert.equal(
    inside,
    s.held.length,
    "every carried clod rides inside the shell",
  );
});

test("opening the bucket lets clods fall, land in the spoil and become ground", () => {
  const s = new Simulation();
  run(s, { ry: -1 }, 32);
  run(s, { rx: -1, ly: 1 }, 70);
  run(s, { ry: 1 }, 100);
  run(s, { lx: 1 }, 80);
  const carried = s.machine.load;
  let peakLoose = 0;
  for (let i = 0; i < 90; i++) {
    s.update({ ...neutral(), rx: 1 }, 1 / 60);
    peakLoose = Math.max(peakLoose, s.falling.length);
  }
  assert.ok(peakLoose > 10, "clods leave the tipped bucket");
  run(s, {}, 300);
  assert.ok(s.machine.load < 0.001, `${s.machine.load} still carried`);
  assert.ok(s.falling.length < 5, `${s.falling.length} clods never settled`);
  assert.ok(Math.abs(volume(s)) < 1e-6, "soil volume drifted");
  let anywhere = 0;
  for (let i = 0; i < s.ground.length; i++)
    if (s.ground[i] > 0) anywhere += s.ground[i];
  assert.ok(
    anywhere * CELL * CELL > carried * 0.9,
    "the ground did not gain the load",
  );
});

test("carried clods spill over the lip when the bucket tilts too far", () => {
  const s = new Simulation();
  s.machine.load = CAPACITY;
  s.reconcileLoad();
  const v0 = volume(s);
  run(s, {}, 30);
  const full = s.machine.load;
  assert.ok(full > CAPACITY * 0.9, `bowl only kept ${full}`);
  // Tip forward well past level but not fully open: the heap slides, the bowl keeps some.
  run(s, { rx: 1 }, 45);
  run(s, {}, 120);
  assert.ok(s.machine.load < full * 0.98, "nothing spilled");
  assert.ok(Math.abs(volume(s) - v0) < 1e-6);
});

test("version 3 saves round-trip clods and version 2 loads rest in the bowl", () => {
  const s = new Simulation();
  run(s, { ry: -1 }, 32);
  run(s, { rx: -1, ly: 1 }, 40);
  const save = s.snapshot();
  assert.equal(save.version, 3);
  assert.ok(save.held.length > 0);
  const restored = new Simulation(parseSave(JSON.stringify(save)));
  assert.equal(restored.held.length, s.held.length);
  assert.equal(restored.machine.load, s.machine.load);
  const legacy = {
    version: 2,
    machine: { ...new Simulation().machine, load: 0.1 },
    ground: Array.from(new Simulation().ground),
    deepest: Array.from(new Simulation().deepest),
    pattern: "ISO",
    falling: [],
  };
  const migrated = new Simulation(parseSave(JSON.stringify(legacy)));
  assert.ok(Math.abs(heldVolume(migrated) - 0.1) < 1e-9);
  assert.ok(migrated.held.length >= 100);
  run(migrated, {}, 60);
  assert.ok(
    migrated.machine.load > 0.09,
    "restored load fell out of a level bucket",
  );
  const tip = tooth(migrated.machine);
  assert.ok(Number.isFinite(tip.y));
});

test("physics keeps a full bucket and a landed pile within a frame budget", () => {
  const s = new Simulation();
  s.machine.load = CAPACITY;
  s.reconcileLoad();
  let worst = 0,
    total = 0;
  // Lift while curling back so the load rides level, then swing with it.
  for (let i = 0; i < 120; i++) {
    s.update(
      { ...neutral(), ...(i < 60 ? { ry: 1, rx: -1 } : { lx: 1 }) },
      1 / 60,
    );
    worst = Math.max(worst, s.soil.physicsMs);
    total += s.soil.physicsMs;
  }
  assert.ok(
    s.held.length > 250,
    `carried only ${s.held.length} clods through lift and swing`,
  );
  console.log(
    `physics: ${s.held.length} carried clods, mean ${(total / 120).toFixed(2)} ms, worst ${worst.toFixed(2)} ms`,
  );
  assert.ok(total / 120 < 60, "physics step is pathologically slow");
  assert.ok(s.held.length * CLOD_VOLUME < CAPACITY * 1.8);
});
