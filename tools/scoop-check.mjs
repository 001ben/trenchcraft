import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
await mkdir(".local", { recursive: true });
const browser = await chromium.launch({ channel: "msedge", headless: true });
try {
  const page = await browser.newPage({
    viewport: { width: 1100, height: 850 },
  });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.route("**/scoop-review", (r) =>
    r.fulfill({
      contentType: "text/html",
      body: `<style>body{margin:0}</style><canvas></canvas><script type="module">import {Simulation,neutral,tooth} from '/src/simulation.ts';import {View} from '/src/view.ts';const sim=new Simulation(),view=new View(document.querySelector('canvas'),sim);await view.load();window.review={sim,view,neutral,tooth};</script>`,
    }),
  );
  await page.goto("http://127.0.0.1:5174/scoop-review");
  await page.waitForFunction(() => window.review);
  await page.evaluate(() => {
    const { sim, view, neutral } = window.review;
    for (let i = 0; i < 32; i++) {
      sim.update({ ...neutral(), ry: -1 }, 1 / 60);
      view.render(1 / 60, i / 60);
    }
  });
  const timings = [],
    frames = [];
  for (let frame = 0; frame < 110; frame++) {
    const result = await page.evaluate((frame) => {
      const { sim, view, neutral, tooth } = window.review;
      const start = performance.now();
      sim.update({ ...neutral(), rx: -1, ly: 1 }, 1 / 60);
      view.render(1 / 60, frame / 60);
      const elapsed = performance.now() - start;
      const p = tooth(sim.machine);
      view.camera.position.set(p.x + 1.7, p.y + 1.05, p.z + 1.8);
      view.camera.lookAt(p.x, p.y + 0.12, p.z - 0.16);
      view.renderer.render(view.scene, view.camera);
      return {
        elapsed,
        load: sim.machine.load,
        bed: view.bucketSoil.bed.volume,
        contact: view.bucketSoil.intake.visible,
        dust: view.dustMesh.count,
        calls: view.renderer.info.render.calls,
        triangles: view.renderer.info.render.triangles,
      };
    }, frame);
    timings.push(result.elapsed);
    frames.push(result);
    if ([4, 12, 24, 40, 70, 109].includes(frame))
      await page.screenshot({ path: `.local/scoop-${frame}.png` });
  }
  assert.ok(
    frames.some((f) => f.contact),
    "active contact strip is visible while actually cutting",
  );
  assert.ok(frames.some((f) => f.load > 0.005));
  assert.ok(frames.every((f) => Math.abs(f.load - f.bed) < 1e-8));
  assert.ok(
    frames.every((f) => f.dust === 0),
    "scooping has no flying collection particles",
  );
  assert.ok(Math.max(...frames.map((f) => f.calls)) < 240);
  assert.deepEqual(errors, []);
  timings.sort((a, b) => a - b);
  console.log(
    JSON.stringify({
      peakCalls: Math.max(...frames.map((f) => f.calls)),
      p95: timings[Math.floor(timings.length * 0.95)],
      final: frames.at(-1),
    }),
  );
} finally {
  await browser.close();
}
