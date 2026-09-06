import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
await mkdir(".local", { recursive: true });
const browser = await chromium.launch({ channel: "msedge", headless: true });
try {
  const page = await browser.newPage({
    viewport: { width: 1200, height: 900 },
  });
  await page.route("**/bucket-review", (r) =>
    r.fulfill({
      contentType: "text/html",
      body: `<style>body{margin:0}</style><canvas></canvas><script type="module">import {Simulation,tooth,CAPACITY,neutral} from '/src/simulation.ts';import {View} from '/src/view.ts';import * as THREE from '/node_modules/.vite/deps/three.js';const sim=new Simulation(),view=new View(document.querySelector('canvas'),sim);await view.load();window.review={sim,view,tooth,CAPACITY,neutral,THREE};</script>`,
    }),
  );
  await page.goto("http://127.0.0.1:5174/bucket-review");
  await page.waitForFunction(() => window.review);
  for (const fraction of [0, 0.25, 1]) {
    await page.evaluate((fraction) => {
      const { sim, view, CAPACITY, THREE } = window.review;
      Object.assign(sim.machine, {
        boom: 0.9,
        stick: -1.7,
        bucket: 0.8,
        load: CAPACITY * fraction,
      });
      view.render(0, 0);
      const p = view.model
        .getObjectByName("BucketFill")
        .getWorldPosition(new THREE.Vector3());
      view.camera.position.copy(p).add(new THREE.Vector3(1.6, 1.3, 2));
      view.camera.lookAt(p);
      view.renderer.render(view.scene, view.camera);
    }, fraction);
    await page.screenshot({ path: `.local/bucket-${fraction * 100}.png` });
  }
  const result = await page.evaluate(() => {
    const { sim, view, THREE, neutral } = window.review;
    Object.assign(sim.machine, {
      boom: 1,
      stick: -0.8,
      bucket: -1.2,
      swing: -0.8,
    });
    for (let i = 0; i < 24; i++) sim.update(neutral(), 1 / 60);
    view.render(0, 0.4);
    const tip = window.review.tooth(sim.machine);
    view.camera.position.set(tip.x + 4, tip.y + 1, tip.z - 1);
    view.camera.lookAt(tip.x, tip.y - 0.5, tip.z);
    view.renderer.render(view.scene, view.camera);
    return {
      falling: sim.falling.length,
      load: sim.machine.load,
      hasPile: sim.ground.some((h) => h > 0),
    };
  });
  assert.ok(result.falling > 0 && result.load > 0);
  assert.equal(result.hasPile, false);
  await page.screenshot({ path: ".local/bucket-discharging.png" });
  const tracks = await page.evaluate(() => {
    const { sim, view, neutral } = window.review;
    sim.machine.heading = 0;
    view.render(0, 0);
    const before = [...view.trackPhase];
    sim.update({ ...neutral(), travel: true, ly: -1, ry: -1 }, 0.05);
    view.render(0, 0);
    const forward = view.trackPhase.map((v, i) => v - before[i]);
    const previous = [...view.trackPhase];
    sim.update({ ...neutral(), travel: true, ly: -1, ry: 1 }, 0.05);
    view.render(0, 0);
    return { forward, pivot: view.trackPhase.map((v, i) => v - previous[i]) };
  });
  assert.ok(
    tracks.forward.every((v) => v < 0),
    "top shoes move forward, lower shoes backward relative to chassis",
  );
  assert.ok(
    tracks.pivot[0] < 0 && tracks.pivot[1] > 0,
    "pivot drives tracks in opposite directions",
  );
  console.log(JSON.stringify({ result, tracks }));
} finally {
  await browser.close();
}
