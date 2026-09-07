import test from "node:test";
import assert from "node:assert/strict";
import { LandSurface } from "../src/land-surface";
import { Simulation, NX, NZ } from "../src/simulation";

test("a fresh plot rebinds the visible ground and future edits to the new simulation", () => {
  const previous = new Simulation(),
    surface = new LandSurface(previous);
  const cell = 27 * NX + 36,
    vertex = (NX + 1) * (NZ + 1) + cell;
  previous.ground[cell] = -0.8;
  previous.deepest[cell] = -0.8;
  surface.markCell(cell);
  surface.flush();
  const positions = surface.geometry.getAttribute("position");
  assert.ok(positions.getY(vertex) < -0.7);
  const fresh = new Simulation();
  surface.setSimulation(fresh);
  assert.equal(positions.getY(vertex), 0);
  assert.equal(surface.isGrass(cell), true);
  fresh.ground[cell] = -0.3;
  surface.markCell(cell);
  surface.flush();
  assert.ok(Math.abs(positions.getY(vertex) + 0.3) < 1e-6);
  surface.geometry.dispose();
  surface.material.map?.dispose();
  surface.material.dispose();
});

test("connected earth surface preserves simulation state and agrees with full normal recomputation", () => {
  const sim = new Simulation(),
    surface = new LandSurface(sim);
  const geometry = surface.geometry,
    positions = geometry.getAttribute("position");
  const count = positions.count,
    index = geometry.index;
  for (const i of [
    0,
    NX - 1,
    NX * (NZ - 1),
    NX * NZ - 1,
    27 * NX + 36,
    27 * NX + 37,
  ]) {
    sim.ground[i] = i % 2 ? 1.3 : -1.2;
    sim.deepest[i] = Math.min(0, sim.ground[i]);
    surface.markCell(i);
  }
  const saved = Array.from(sim.ground);
  surface.flush();
  assert.deepEqual(
    Array.from(sim.ground),
    saved,
    "rendering cannot move or create soil",
  );
  assert.equal(geometry.index, index, "topology is reused across digging");
  assert.equal(positions.count, count);
  for (let i = 0; i < NX * NZ; i++)
    assert.equal(positions.getY((NX + 1) * (NZ + 1) + i), sim.ground[i]);
  const reference = geometry.clone();
  reference.computeVertexNormals();
  const expected = reference.getAttribute("normal"),
    actual = geometry.getAttribute("normal");
  for (let i = 0; i < actual.count; i++)
    for (const axis of ["getX", "getY", "getZ"] as const) {
      assert.ok(Number.isFinite(actual[axis](i)));
      assert.ok(
        Math.abs(actual[axis](i) - expected[axis](i)) < 1e-5,
        "local updates match a complete mesh rebuild",
      );
    }
  const unchanged = positions.version;
  surface.flush();
  assert.equal(positions.version, unchanged, "idle terrain causes no upload");
  reference.dispose();
  surface.geometry.dispose();
  surface.material.map?.dispose();
  surface.material.dispose();
});

test("cut grass stays bare after backfill and mesh updates remain local", () => {
  const sim = new Simulation(),
    surface = new LandSurface(sim),
    cell = 27 * NX + 36;
  assert.ok(surface.isGrass(cell));
  sim.ground[cell] = -0.4;
  sim.deepest[cell] = -0.4;
  surface.markCell(cell);
  surface.flush();
  assert.equal(surface.isGrass(cell), false);
  sim.ground[cell] = 0;
  surface.markCell(cell);
  surface.flush();
  assert.equal(surface.isGrass(cell), false);
  const normals = surface.geometry.getAttribute("normal");
  assert.ok(
    normals.updateRanges.reduce((sum, range) => sum + range.count, 0) <
      normals.array.length * 0.01,
    "an isolated cut does not upload the entire normal buffer",
  );
  surface.geometry.dispose();
  surface.material.map?.dispose();
  surface.material.dispose();
});
