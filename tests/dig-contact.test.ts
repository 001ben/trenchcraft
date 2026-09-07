import test from "node:test";
import assert from "node:assert/strict";
import {
  Simulation,
  neutral,
  tooth,
  cellPosition,
  CELL,
} from "../src/simulation";

const volume = (sim: Simulation) =>
  sim.ground.reduce((sum, h) => sum + h * CELL * CELL, 0) +
  sim.machine.load +
  sim.falling.reduce((sum, p) => sum + p.volume, 0);

for (const yaw of [0, Math.PI / 2]) {
  for (const hz of [30, 60, 120]) {
    test(`lowering alone cuts below the initial ground stop (${yaw}, ${hz} Hz)`, () => {
      const sim = new Simulation();
      sim.machine.swing = yaw;
      const before = volume(sim);
      let cut = 0;
      for (let i = 0; i < 3 * hz; i++) {
        sim.update({ ...neutral(), ry: -1 }, 1 / hz);
        cut += sim.cutRate / hz;
      }
      const tip = tooth(sim.machine);
      assert.ok(tip.y < -0.25, `teeth stalled at ${tip.y} m`);
      assert.ok(cut > 0.01, `lowering removed only ${cut} cubic metres`);
      assert.ok(Math.abs(volume(sim) - before) < 1e-6);

      sim.resetRates();
      sim.update(neutral(), 1 / hz);
      assert.equal(sim.cutRate, 0, "stationary teeth cannot cut");
      sim.update({ ...neutral(), ry: 1 }, 1 / hz);
      assert.equal(sim.cutRate, 0, "lifting out cannot cut");
    });
  }
}

for (const yaw of [0, Math.PI / 2]) {
  test(`outer teeth can shave a trench shoulder when the middle teeth are over air (${yaw})`, () => {
    const sim = new Simulation();
    sim.machine.swing = yaw;
    for (let i = 0; i < 32; i++) sim.update({ ...neutral(), ry: -1 }, 1 / 60);
    const tip = tooth(sim.machine);
    for (let i = 0; i < sim.ground.length; i++) {
      const p = cellPosition(i);
      const across =
        (p.x - tip.x) * Math.cos(yaw) - (p.z - tip.z) * Math.sin(yaw);
      if (Math.abs(across) < 0.2) sim.ground[i] = sim.deepest[i] = -0.8;
    }
    assert.ok(
      sim.height(tip.x, tip.z) < tip.y,
      "middle teeth are above the existing trench floor",
    );
    const before = volume(sim);
    let cut = 0;
    for (let i = 0; i < 45; i++) {
      sim.update({ ...neutral(), rx: -1, ly: 1 }, 1 / 60);
      cut += sim.cutRate / 60;
    }
    assert.ok(cut > 0.001, `outer teeth removed only ${cut} cubic metres`);
    assert.ok(
      Math.abs(volume(sim) - before) < 1e-6,
      "cutting preserves soil volume",
    );
  });
}

test("a moving bucket completely clear of the ground does not manufacture dirt", () => {
  const sim = new Simulation();
  sim.machine.boom = 1.2;
  for (let i = 0; i < 40; i++)
    sim.update({ ...neutral(), rx: -1, ly: 1 }, 1 / 60);
  assert.ok(sim.ground.every((h) => h === 0));
  assert.equal(sim.machine.load, 0);
});
