import test from "node:test";
import assert from "node:assert/strict";
import {
  Simulation,
  axes,
  neutral,
  CAPACITY,
  CELL,
  parseSave,
  cellPosition,
  target,
  tooth,
  bucketOpening,
} from "../src/simulation";
const volume = (s: Simulation) =>
  s.ground.reduce((sum, h) => sum + h * CELL * CELL, 0) +
  s.machine.load +
  s.falling.reduce((sum, p) => sum + p.volume, 0);
test("ISO maps all eight directions; alternate swaps only boom and arm", () => {
  const c = neutral();
  c.ly = 1;
  assert.equal(axes(c, "ISO").stick, -1);
  assert.equal(axes(c, "Alternate").boom, 1);
  c.ly = -1;
  assert.equal(axes(c, "ISO").stick, 1);
  c.ly = 0;
  c.ry = 1;
  assert.equal(axes(c, "ISO").boom, 1);
  assert.equal(axes(c, "Alternate").stick, -1);
  c.ry = -1;
  assert.equal(axes(c, "ISO").boom, -1);
  c.rx = -1;
  assert.equal(axes(c, "ISO").curl, 1);
  c.rx = 1;
  assert.equal(axes(c, "ISO").curl, -1);
  c.lx = 1;
  assert.equal(axes(c, "ISO").swing, -1);
  c.lx = -1;
  assert.equal(axes(c, "ISO").swing, 1);
});
test("digging is capacity bounded and conserves soil through placement and reload", () => {
  const s = new Simulation();
  for (let i = 0; i < 300; i++) s.dig({ x: 0, y: -0.7, z: -3 }, 1 / 60);
  assert.ok(Math.abs(s.machine.load - CAPACITY) < 1e-6);
  assert.ok(Math.abs(volume(s)) < 1e-6);
  const before = s.ground.slice();
  s.dig({ x: 0, y: -1, z: -5 }, 1);
  assert.deepEqual(s.ground, before);
  const restored = new Simulation(parseSave(JSON.stringify(s.snapshot())));
  assert.equal(restored.machine.load, s.machine.load);
  for (let i = 0; i < 300; i++) {
    restored.dump({ x: 3.75, y: 1, z: -3 }, 1 / 60);
    restored.update(neutral(), 1 / 60);
  }
  assert.ok(restored.machine.load < 1e-6);
  assert.ok(Math.abs(volume(restored)) < 1e-6);
  assert.ok(restored.score().tidiness > 0.99);
  assert.equal(restored.falling.length, 0);
  assert.ok(restored.ground.some((h) => h > 0));
});
test("bucket teeth curl toward the cab and upward, then open away and downward", () => {
  const s = new Simulation();
  s.machine.boom = 0.9;
  const start = tooth(s.machine);
  s.update({ ...neutral(), rx: -1 }, 0.05);
  const curled = tooth(s.machine);
  assert.ok(
    curled.z > start.z,
    "ISO right-left brings the cutting edge toward the cab",
  );
  assert.ok(curled.y > start.y, "curl lifts the cutting edge");
  s.update({ ...neutral(), rx: 1 }, 0.05);
  const opened = tooth(s.machine);
  assert.ok(opened.z < curled.z);
  assert.ok(opened.y < curled.y);
  assert.ok(
    bucketOpening(s.machine).y > 0,
    "working bucket holds soil with its opening upward",
  );
});
test("boom, arm and swing move in the operator's labelled ISO directions", () => {
  const move = (c: Partial<ReturnType<typeof neutral>>) => {
    const s = new Simulation();
    s.machine.boom = 0.9;
    const before = tooth(s.machine);
    s.update({ ...neutral(), ...c }, 0.05);
    return { before, after: tooth(s.machine) };
  };
  for (const [c, axis, sign] of [
    [{ ry: -1 }, "y", -1],
    [{ ry: 1 }, "y", 1],
    [{ ly: -1 }, "z", -1],
    [{ ly: 1 }, "z", 1],
    [{ lx: -1 }, "x", -1],
    [{ lx: 1 }, "x", 1],
  ] as const) {
    const { before, after } = move(c);
    assert.ok((after[axis] - before[axis]) * sign > 0, JSON.stringify(c));
  }
});
test("untouched ground resists the teeth and lowering alone cannot excavate", () => {
  const s = new Simulation();
  for (let i = 0; i < 600; i++) s.update({ ...neutral(), ry: -1 }, 1 / 60);
  const tip = tooth(s.machine);
  assert.ok(tip.y >= s.height(tip.x, tip.z) - 0.101);
  assert.equal(s.machine.load, 0);
  assert.ok(s.ground.every((h) => h === 0));
  assert.ok(s.resistance > 0);
});
test("tipped soil falls after releasing the stick and survives an in-flight reload", () => {
  let s = new Simulation();
  s.dig({ x: 0, y: -0.7, z: -3 }, 1);
  Object.assign(s.machine, { boom: 1, stick: -0.8, bucket: -1.2, swing: -0.8 });
  assert.ok(bucketOpening(s.machine).y < 0.25);
  s.update(neutral(), 1 / 60);
  assert.ok(s.falling.length > 0);
  assert.ok(
    s.ground.every((h) => h <= 0),
    "no spoil pile appears before impact",
  );
  assert.ok(Math.abs(volume(s)) < 1e-6);
  const save = parseSave(JSON.stringify(s.snapshot()));
  assert.ok(save);
  s = new Simulation(save);
  for (let i = 0; i < 300; i++) s.update(neutral(), 1 / 60);
  assert.ok(s.machine.load < 1e-6);
  assert.equal(s.falling.length, 0);
  assert.ok(s.ground.some((h) => h > 0));
  assert.ok(Math.abs(volume(s)) < 1e-6);
});
test("soil cannot be dumped outside the plot or into an over-height pile", () => {
  const s = new Simulation();
  s.machine.load = 0.1;
  s.dump({ x: 100, y: 2, z: 100 }, 1);
  assert.equal(s.machine.load, 0.1);
  s.ground.fill(1.8);
  s.dump({ x: 0, y: 3, z: 0 }, 1);
  assert.ok(s.machine.load > 0.09999);
});
test("arm controls physically scoop then empty, and neutral never digs", () => {
  const s = new Simulation();
  const c = neutral();
  c.ry = -1;
  for (let i = 0; i < 32; i++) s.update(c, 1 / 60);
  assert.equal(s.machine.load, 0);
  c.ry = 0;
  c.rx = -1;
  c.ly = 1;
  for (let i = 0; i < 60; i++) s.update(c, 1 / 60);
  assert.ok(s.machine.load > 0.005, "real joystick curl/crowd removes earth");
  c.rx = c.ly = 0;
  c.ry = 1;
  for (let i = 0; i < 100; i++) s.update(c, 1 / 60);
  c.ry = 0;
  c.lx = 1;
  for (let i = 0; i < 80; i++) s.update(c, 1 / 60);
  c.lx = 0;
  c.rx = 1;
  for (let i = 0; i < 230; i++) s.update(c, 1 / 60);
  assert.ok(
    s.machine.load < 0.001,
    "opening a raised bucket deposits its soil",
  );
  assert.ok(Math.abs(volume(s)) < 1e-6);
});
test("straight trench, off-line cuts and backfill affect the actual score", () => {
  const s = new Simulation();
  for (let i = 0; i < s.ground.length; i++) {
    const p = cellPosition(i);
    if (target(p.x, p.z)) s.ground[i] = s.deepest[i] = -0.6;
  }
  assert.equal(s.score().stars, 3);
  s.ground.fill(0);
  assert.equal(s.score().progress, 0);
  const dirty = new Simulation();
  dirty.dig({ x: 5, y: -0.6, z: 3 }, 1);
  assert.equal(dirty.score().straightness, 0);
});
test("two track levers travel and pivot without changing attachment joints", () => {
  const s = new Simulation(),
    initial = { ...s.machine };
  s.update({ ...neutral(), leftTrack: 1, rightTrack: 1 }, 0.05);
  assert.ok(s.machine.z < initial.z);
  assert.equal(s.machine.swing, 0);
  assert.equal(s.machine.boom, initial.boom);
  s.update({ ...neutral(), leftTrack: 1, rightTrack: -1 }, 0.05);
  assert.ok(s.machine.heading < 0);
});
test("travel levers and digging joysticks work independently at the same time", () => {
  const s = new Simulation(),
    before = { ...s.machine };
  s.update({ ...neutral(), leftTrack: 1, rightTrack: 1, ry: 1 }, 0.05);
  assert.ok(s.machine.z < before.z);
  assert.ok(s.machine.boom > before.boom);
  const stopped = { ...s.machine };
  s.update({ ...neutral(), rx: -1 }, 0.05);
  assert.equal(s.machine.z, stopped.z);
  assert.ok(s.machine.bucket > stopped.bucket);
});
test("invalid saves are rejected and valid terrain and pattern survive", () => {
  const s = new Simulation();
  s.pattern = "Alternate";
  s.dig({ x: 0, y: -0.5, z: -3 }, 0.1);
  const save = s.snapshot();
  assert.deepEqual(parseSave(JSON.stringify(save)), save);
  for (const mutate of [
    (p: any) => (p.machine.load = -1),
    (p: any) => (p.machine.boom = 99),
    (p: any) => p.ground.pop(),
    (p: any) => (p.deepest[0] = 1),
    (p: any) => (p.pattern = "unknown"),
    (p: any) =>
      (p.falling = [{ x: 0, y: 1, z: 0, vx: 0, vy: 0, vz: 0, volume: -1 }]),
  ]) {
    const bad = structuredClone(save);
    mutate(bad);
    assert.equal(parseSave(JSON.stringify(bad)), null);
  }
  assert.equal(parseSave("broken"), null);
  const legacy = { ...save, version: 1, falling: undefined };
  assert.deepEqual(parseSave(JSON.stringify(legacy)), save);
});
