import test from "node:test";
import assert from "node:assert/strict";
import { Simulation, frameOf, neutral, type SoilClod } from "../src/simulation";
import { BucketShell, makeFrame, toWorld, floorV } from "../src/bucket-shell";
import { BucketSoil } from "../src/bucket-soil";
import { CLOD_RADIUS as R, CLOD_VOLUME } from "../src/soil";

function raisedBucket() {
  const sim = new Simulation();
  Object.assign(sim.machine, {
    boom: 0.8,
    stick: -1.1,
    bucket: 0.8 - 1.1 + Math.PI / 2,
  });
  return sim;
}

function carried(sim: Simulation, y: number, asleep = true) {
  const f = makeFrame(),
    p = new Float64Array(3);
  frameOf(sim.machine, f);
  toWorld(f, 0, y, 0.3, p);
  const clod: SoilClod = {
    x: p[0],
    y: p[1],
    z: p[2],
    vx: 0,
    vy: 0,
    vz: 0,
    volume: CLOD_VOLUME,
    asleep,
  };
  sim.held.push(clod);
  sim.machine.load += clod.volume;
  return clod;
}

function step(sim: Simulation, frames: number) {
  for (let i = 0; i < frames; i++) sim.update(neutral(), 1 / 60);
}

test("saved sleeping dirt inside the bucket falls until steel actually supports it", () => {
  const sim = raisedBucket();
  const clod = carried(sim, floorV(0.3) + 0.3);
  const startY = clod.y;
  step(sim, 60);
  assert.ok(
    clod.y < startY - 0.2,
    `unsupported clod moved only ${startY - clod.y} m`,
  );
  assert.equal(sim.held.length, 1, "the bowl catches the falling clod");
  assert.ok(Math.abs(sim.machine.load - CLOD_VOLUME) < 1e-9);
  step(sim, 120);
  assert.ok(clod.asleep, "real steel contact still allows sleeping");
});

test("an unsupported sleeping cluster cannot anchor itself through carried neighbours", () => {
  const sim = raisedBucket();
  const clods = [0, 1, 2].map((i) =>
    carried(sim, floorV(0.3) + 0.25 + i * R * 2),
  );
  const startY = clods[0].y;
  step(sim, 90);
  assert.ok(
    clods.every((p) => p.y < startY - 0.08),
    "the whole island must fall into the bowl",
  );
  assert.equal(sim.held.length, 3);
});

test("removing ground under a sleeping stack wakes it and returns its volume to the land", () => {
  const sim = raisedBucket();
  const clods = [0, 1, 2].map((i) => ({
    x: 5,
    y: R + i * R * 2,
    z: 5,
    vx: 0,
    vy: 0,
    vz: 0,
    volume: CLOD_VOLUME,
    asleep: true,
  }));
  sim.falling.push(...clods);
  // The stack was resting here before the bank below it was excavated.
  sim.ground.fill(-0.5);
  const before = sim.ground.reduce((sum, h) => sum + h * 0.25 ** 2, 0);
  step(sim, 90);
  assert.equal(sim.falling.length, 0, "unsupported soil falls and settles");
  const after = sim.ground.reduce((sum, h) => sum + h * 0.25 ** 2, 0);
  assert.ok(Math.abs(after - before - 3 * CLOD_VOLUME) < 1e-7);
});

test("the air inside a bucket and the underside of its lip are not supporting faces", () => {
  const shell = new BucketShell(R);
  assert.equal(shell.supports(0, -0.1, 0.3, R * 0.2), false);
  assert.equal(shell.supports(0, -0.32 + R, 0.66, R * 0.2), true);
  assert.equal(shell.supports(0, -0.38 - R, 0.66, R * 0.2), false);
});

test("cut earth waiting on the bank cannot draw a floating heap attached to the bucket", () => {
  const sim = raisedBucket(),
    skin = new BucketSoil(null);
  const clod = carried(sim, floorV(0.3) + R);
  clod.pending = true;
  skin.update(sim, 1 / 60);
  assert.equal(skin.visible, false);
  assert.equal(skin.bed.volume, 0);
  clod.pending = false;
  skin.update(sim, 1 / 60);
  assert.equal(skin.visible, true);
  assert.equal(skin.bed.volume, CLOD_VOLUME);
});
