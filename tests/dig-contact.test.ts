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

for (const bucket of [-1.2, -0.8]) {
  test(`opened teeth penetrate soil even when the mouth faces down (${bucket})`, () => {
    const sim = new Simulation();
    sim.machine.bucket = bucket;
    let cut = 0;
    for (let i = 0; i < 120; i++) {
      sim.update({ ...neutral(), ry: -0.6 }, 1 / 60);
      cut += sim.cutRate / 60;
    }
    assert.ok(tooth(sim.machine).y < -0.25, "opened teeth remain at the old stop");
    assert.ok(cut > 0.01, "opened teeth did not break soil");
    const penetrated = tooth(sim.machine);
    for (let i = 0; i < 90; i++)
      sim.update({ ...neutral(), ly: 0.6, rx: -0.6 }, 1 / 60);
    const scooped = tooth(sim.machine);
    assert.ok(scooped.z > penetrated.z + 0.15, "crowding advances through the bank");
    assert.ok(sim.machine.bucket > bucket + 0.05, "curl remains available in soil");
    assert.ok(Math.abs(volume(sim)) < 1e-6);
  });
}

test("lowering the back of a tightly curled bucket does not cut", () => {
  const sim = new Simulation();
  sim.machine.bucket = 1.5;
  for (let i = 0; i < 180; i++)
    sim.update({ ...neutral(), ry: -1 }, 1 / 60);
  assert.ok(sim.ground.every((h) => h === 0));
  assert.equal(sim.machine.load, 0);
});

test("loose soil cannot immediately refill cells being excavated", () => {
  const sim = new Simulation();
  sim.dig({ x: 0, y: -0.4, z: -3 }, 0.05);
  const cut = sim.cuts[0];
  const ground = sim.ground.slice();
  const deposited = sim.absorb({ x: cut.x, y: cut.bottom, z: cut.z, vx: 0, vy: 0, vz: 0, volume: 0.001 });
  for (const parcel of sim.cuts)
    assert.equal(sim.height(parcel.x, parcel.z), parcel.bottom);
  assert.ok(
    Math.abs(sim.ground.reduce((v, h, i) => v + (h - ground[i]) * CELL * CELL, 0) -
      (deposited ? 0.001 : 0)) < 1e-6,
    "any displaced soil is deposited outside the active cut without volume loss",
  );
});

test("partial edge overlap changes continuously across a terrain cell centre", () => {
  const depths = [-0.00001, 0.00001].map((offset) => {
    const sim = new Simulation();
    sim.dig({ x: 0.125 - 0.39 + offset, y: -0.5, z: -3 }, 0.02, 1);
    return -sim.height(0.125, -2.875);
  });
  assert.ok(depths.every((d) => d > 0.001), "both footprints overlap the cell");
  assert.ok(Math.abs(depths[0] - depths[1]) < 0.00001, "contact jumps at a cell centre");
});

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
