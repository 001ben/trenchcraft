import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
const browser = await chromium.launch({ channel: "msedge", headless: true });
try {
  const page = await browser.newPage({
    viewport: { width: 1024, height: 768 },
  });
  await page.route("**/model-review", (r) =>
    r.fulfill({
      contentType: "text/html",
      body: `<style>body{margin:0}</style><canvas></canvas><script type="module">import {Simulation,tooth} from '/src/simulation.ts';import {View} from '/src/view.ts';import * as THREE from '/node_modules/.vite/deps/three.js';const sim=new Simulation(),view=new View(document.querySelector('canvas'),sim);await view.load();window.review={sim,view,tooth,THREE};</script>`,
    }),
  );
  await page.goto("http://127.0.0.1:5174/model-review");
  await page.waitForFunction(() => window.review);
  const result = await page.evaluate(async () => {
    const { sim, view, tooth, THREE } = window.review;
    let error = 0,
      linkError = 0;
    const timings = [];
    for (let i = 0; i < 90; i++) {
      sim.machine.heading = i * 0.01;
      sim.machine.swing = i * 0.012;
      sim.machine.boom = 0.2 + i * 0.008;
      sim.machine.stick = -1.8 + i * 0.01;
      sim.machine.bucket = -0.4 + i * 0.02;
      await new Promise(requestAnimationFrame);
      const start = performance.now();
      sim.update(
        { lx: 0, ly: 0, rx: 0, ry: 0, leftTrack: 0, rightTrack: 0 },
        1 / 60,
      );
      view.render(1 / 60, i / 60);
      for (const [j, arm] of view.hydraulics.arms.entries())
        linkError = Math.max(
          linkError,
          Math.abs(arm.scale.y - (j % 2 ? 0.36 : 0.4)),
        );
      timings.push(performance.now() - start);
      const visual = view.model
        .getObjectByName("Bucket")
        .localToWorld(new THREE.Vector3(0, -0.35, 0.7));
      const expected = tooth(sim.machine);
      error = Math.max(
        error,
        visual.distanceTo(
          new THREE.Vector3(expected.x, expected.y, expected.z),
        ),
      );
    }
    const cell = 27 * 72 + 36;
    const matrix = new THREE.Matrix4();
    view.turf.getMatrixAt(cell, matrix);
    const intact = matrix.elements[0] !== 0;
    sim.dig({ x: 0.125, y: -0.5, z: -3.125 }, 0.3);
    view.render(0, 0);
    view.turf.getMatrixAt(cell, matrix);
    const cut = matrix.elements[0] === 0;
    sim.ground[cell] = 0;
    sim.changed.add(cell);
    view.render(0, 0);
    view.turf.getMatrixAt(cell, matrix);
    const backfillBare = matrix.elements[0] === 0;
    timings.sort((a, b) => a - b);
    return {
      turf: { intact, cut, backfillBare },
      maxToothError: error,
      maxLinkError: linkError,
      p95: timings[Math.floor(timings.length * 0.95)],
      drawCalls: view.renderer.info.render.calls,
      triangles: view.renderer.info.render.triangles,
    };
  });
  console.log(JSON.stringify(result));
  assert.deepEqual(result.turf, {
    intact: true,
    cut: true,
    backfillBare: true,
  });
  assert.ok(
    result.maxToothError < 0.001,
    "rendered bucket must match simulation kinematics",
  );
  assert.ok(result.drawCalls < 240, "bounded draw calls");
  assert.ok(
    result.maxLinkError < 0.00001,
    "bucket rocker links retain their length through articulated poses",
  );
  for (const [name, eye] of [
    ["side", [9, 3.2, -1.4]],
    ["front", [6, 4, -7]],
  ]) {
    await page.evaluate((eye) => {
      const { sim, view } = window.review;
      Object.assign(sim.machine, {
        heading: 0,
        swing: 0,
        boom: 0.58,
        stick: -1.5,
        bucket: 0.15,
        load: 0,
      });
      view.render(0, 0);
      view.camera.position.set(...eye);
      view.camera.lookAt(0, 1.4, -1.4);
      view.renderer.render(view.scene, view.camera);
    }, eye);
    await page.screenshot({ path: `.local/excavator-${name}.png` });
  }
} finally {
  await browser.close();
}
