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
} from "../src/simulation";
const volume = (s: Simulation) =>
  s.ground.reduce((sum, h) => sum + h * CELL * CELL, 0) + s.machine.load;
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
  for (let i = 0; i < 300; i++) restored.dump({ x: 3, y: 1, z: -3 }, 1 / 60);
  assert.ok(restored.machine.load < 1e-6);
  assert.ok(Math.abs(volume(restored)) < 1e-6);
  assert.ok(restored.score().tidiness > 0.99);
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
  s.update({ ...neutral(), travel: true, ly: -1, ry: -1 }, 0.05);
  assert.ok(s.machine.z < initial.z);
  assert.equal(s.machine.swing, 0);
  assert.equal(s.machine.boom, initial.boom);
  s.update({ ...neutral(), travel: true, ly: -1, ry: 1 }, 0.05);
  assert.ok(s.machine.heading < 0);
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
  ]) {
    const bad = structuredClone(save);
    mutate(bad);
    assert.equal(parseSave(JSON.stringify(bad)), null);
  }
  assert.equal(parseSave("broken"), null);
});
