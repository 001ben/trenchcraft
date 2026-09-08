import test from "node:test";
import assert from "node:assert/strict";
import { Simulation, tooth } from "../src/simulation";

test("grade measures the current floor, not bucket teeth or the deepest past cut", () => {
  const sim = new Simulation();
  const tip = tooth(sim.machine);
  sim.deepest.fill(-0.9);
  assert.deepEqual(sim.grade(tip.x, tip.z), { depthCm: 0, targetCm: 60, state: "shallow" });
  sim.ground.fill(-0.6);
  assert.deepEqual(sim.grade(tip.x, tip.z), { depthCm: 60, targetCm: 60, state: "on-grade" });
  sim.machine.boom = 1.2;
  assert.equal(sim.grade(tip.x, tip.z).depthCm, 60);
  sim.ground.fill(-0.3);
  assert.equal(sim.grade(tip.x, tip.z).state, "shallow", "backfill clears the reached state");
});

test("grade distinguishes unfinished, reached, over-dug and outside the trench", () => {
  const sim = new Simulation();
  for (const [height, expected] of [[-0.59, "shallow"], [-0.6, "on-grade"], [-0.65, "on-grade"], [-0.66, "too-deep"]] as const) {
    sim.ground.fill(height);
    assert.equal(sim.grade(0, -3).state, expected);
  }
  assert.equal(sim.grade(3, -3).state, "off-line");
  assert.equal(sim.grade(0, -1).state, "off-line");
});
