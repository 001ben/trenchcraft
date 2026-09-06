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
    let error = 0;
    const timings = [];
    for (let i = 0; i < 90; i++) {
      sim.machine.heading = i * 0.01;
      sim.machine.swing = i * 0.012;
      sim.machine.boom = 0.2 + i * 0.008;
      sim.machine.stick = -1.8 + i * 0.01;
      sim.machine.bucket = -0.4 + i * 0.02;
      await new Promise(requestAnimationFrame);
      const start = performance.now();
      sim.update({ lx: 0, ly: 0, rx: 0, ry: 0, travel: false }, 1 / 60);
      view.render(1 / 60, i / 60);
      timings.push(performance.now() - start);
      const visual = view.model
        .getObjectByName("Bucket")
        .localToWorld(new THREE.Vector3(0, -0.35, -0.7));
      const expected = tooth(sim.machine);
      error = Math.max(
        error,
        visual.distanceTo(
          new THREE.Vector3(expected.x, expected.y, expected.z),
        ),
      );
    }
    timings.sort((a, b) => a - b);
    return {
      maxToothError: error,
      p95: timings[Math.floor(timings.length * 0.95)],
      drawCalls: view.renderer.info.render.calls,
      triangles: view.renderer.info.render.triangles,
    };
  });
  console.log(JSON.stringify(result));
  assert.ok(
    result.maxToothError < 0.001,
    "rendered bucket must match simulation kinematics",
  );
  assert.ok(result.drawCalls < 240, "bounded draw calls");
} finally {
  await browser.close();
}
