import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";

await mkdir(".local", { recursive: true });
const browser = await chromium.launch({ channel: "msedge", headless: true });
try {
  const page = await browser.newPage({
    viewport: { width: 1000, height: 750 },
  });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("**/gravity-review", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: `<style>body{margin:0}</style><canvas></canvas><script type="module">
      import {Simulation,neutral} from '/src/simulation.ts';
      import {CLOD_RADIUS as r,CLOD_VOLUME as volume} from '/src/soil.ts';
      import {View} from '/src/view.ts';
      const sim=new Simulation(), view=new View(document.querySelector('canvas'),sim);
      await view.load();
      for(let x=0;x<10;x++)for(let y=0;y<8;y++)for(let z=0;z<10;z++)
        sim.falling.push({x:3+x*r*2,y:2+y*r*2,z:3+z*r*2,vx:0,vy:0,vz:0,volume,asleep:true});
      window.review={sim,view,neutral};
    </script>`,
    }),
  );
  await page.goto("http://127.0.0.1:5174/gravity-review");
  await page.waitForFunction(() => window.review);
  const results = [];
  for (const [name, frames] of [
    ["suspended", 0],
    ["falling", 72],
    ["landed", 72],
    ["settled", 216],
  ]) {
    const state = await page.evaluate((frames) => {
      const { sim, view, neutral } = window.review,
        times = [];
      for (let i = 0; i < frames; i++) {
        sim.update(neutral(), 1 / 144);
        times.push(sim.soil.physicsMs);
      }
      view.render(0, 0);
      view.camera.position.set(6, 4, 7);
      view.camera.lookAt(3, 1, 3);
      view.renderer.render(view.scene, view.camera);
      times.sort((a, b) => a - b);
      return {
        clods: sim.falling.length,
        meanY:
          sim.falling.reduce((sum, p) => sum + p.y, 0) /
          (sim.falling.length || 1),
        groundVolume: sim.ground.reduce((sum, h) => sum + h * 0.25 ** 2, 0),
        physicsP95: times[Math.floor(times.length * 0.95)] ?? 0,
        calls: view.renderer.info.render.calls,
      };
    }, frames);
    await page.screenshot({ path: `.local/gravity-${name}.png` });
    results.push({ name, ...state });
  }
  assert.ok(
    results[0].meanY - results[1].meanY > 0.95,
    "packed load must visibly fall in half a second",
  );
  assert.ok(results[3].clods < 10, "no suspended block remains");
  assert.ok(
    Math.abs(results[3].groundVolume - 0.2) < 0.003,
    "the full load becomes soil on the plot",
  );
  assert.deepEqual(errors, []);
  await writeFile(
    ".local/gravity-result.json",
    JSON.stringify(results, null, 2),
  );
  console.log(JSON.stringify(results));
  console.log(
    "PASS: the detached 800-clod load falls, lands, and becomes terrain at 144 Hz.",
  );
} finally {
  await browser.close();
}
