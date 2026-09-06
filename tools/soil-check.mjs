import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
await mkdir(".local", { recursive: true });
const browser = await chromium.launch({ channel: "msedge", headless: true });
try {
  const page = await browser.newPage({
    viewport: { width: 1200, height: 900 },
  });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  await page.route("**/soil-review", (r) =>
    r.fulfill({
      contentType: "text/html",
      body: `<style>body{margin:0}</style><canvas></canvas><script type="module">import {Simulation,neutral,tooth,frameOf,CAPACITY} from '/src/simulation.ts';import {View} from '/src/view.ts';import * as THREE from '/node_modules/.vite/deps/three.js';const sim=new Simulation(),view=new View(document.querySelector('canvas'),sim);await view.load();window.review={sim,view,neutral,tooth,frameOf,CAPACITY,THREE};</script>`,
    }),
  );
  await page.goto("http://127.0.0.1:5174/soil-review");
  await page.waitForFunction(() => window.review);
  // Drive a real cycle with the ISO controls and look into the bowl from the cab side.
  const phase = async (name, controls, frames, camera) => {
    const result = await page.evaluate(
      ({ controls, frames, camera }) => {
        const { sim, view, neutral, frameOf, THREE } = window.review;
        const timings = [];
        for (let i = 0; i < frames; i++) {
          const start = performance.now();
          sim.update({ ...neutral(), ...controls }, 1 / 60);
          view.render(1 / 60, i / 60);
          timings.push(performance.now() - start);
        }
        const f = new Float64Array(12);
        frameOf(sim.machine, f);
        const pivot = new THREE.Vector3(f[0], f[1], f[2]),
          x = new THREE.Vector3(f[3], f[4], f[5]),
          y = new THREE.Vector3(f[6], f[7], f[8]),
          z = new THREE.Vector3(f[9], f[10], f[11]);
        const [cx, cy, cz, tx, ty, tz] = camera;
        view.camera.position
          .copy(pivot)
          .addScaledVector(x, cx)
          .addScaledVector(y, cy)
          .addScaledVector(z, cz);
        view.camera.lookAt(
          pivot
            .clone()
            .addScaledVector(x, tx)
            .addScaledVector(y, ty)
            .addScaledVector(z, tz),
        );
        view.renderer.render(view.scene, view.camera);
        timings.sort((a, b) => a - b);
        return {
          load: sim.machine.load,
          held: sim.held.length,
          loose: sim.falling.length,
          awake: sim.soil.awakeCount(),
          physicsP95: sim.soil.physicsMs,
          p95: timings[Math.floor(timings.length * 0.95)],
          calls: view.renderer.info.render.calls,
          triangles: view.renderer.info.render.triangles,
          ground: sim.ground.reduce((s, h) => s + Math.max(0, h), 0),
        };
      },
      { controls, frames, camera },
    );
    await page.screenshot({ path: `.local/soil-${name}.png` });
    console.log(name, JSON.stringify(result));
    return result;
  };
  const cabSide = [0.9, 0.55, 1.35, 0, -0.2, 0.25];
  await phase("lower", { ry: -1 }, 32, cabSide);
  const scooped = await phase("scoop", { rx: -1, ly: 1 }, 90, cabSide);
  assert.ok(scooped.load > 0.012, "curl and crowd fill the bucket with clods");
  assert.ok(scooped.held > 15, "carried clods exist");
  assert.ok(
    Math.abs(
      scooped.load -
        (await page.evaluate(() =>
          window.review.sim.held.reduce((s, c) => s + c.volume, 0),
        )),
    ) < 1e-9,
    "carried clod volumes sum to the load",
  );
  const lifted = await phase("lift", { ry: 1, rx: -1 }, 70, cabSide);
  // Cut earth the curl did not sweep in stays on the bank and stops counting.
  assert.ok(
    lifted.load >= scooped.load * 0.6,
    `the curl swept in too little of the cut: ${scooped.load} -> ${lifted.load}`,
  );
  const swung = await phase("swing", { lx: 1 }, 90, cabSide);
  assert.ok(
    swung.load >= lifted.load * 0.95,
    `carried load lost while swinging: ${lifted.load} -> ${swung.load}`,
  );
  const opening = await phase(
    "dump",
    { rx: 1 },
    200,
    [1.6, 0.4, -0.9, 0, -0.5, 0.2],
  );
  assert.ok(
    opening.loose > 0 || opening.load < swung.load,
    "tipping releases earth",
  );
  const settled = await phase(
    "settled",
    {},
    240,
    [2.2, -0.2, -1.4, 0, -2.2, 0],
  );
  assert.ok(settled.load < 0.002, `bucket still holds ${settled.load}`);
  assert.ok(settled.loose < 6, `${settled.loose} clods never settled`);
  assert.ok(settled.ground > 0.05, "no spoil pile formed on the ground");
  assert.ok(Math.max(scooped.calls, swung.calls, settled.calls) < 240);
  assert.deepEqual(errors, []);
  await writeFile(
    ".local/soil-result.json",
    JSON.stringify({ scooped, lifted, swung, opening, settled }, null, 2),
  );
  console.log(
    "PASS: physical clods scooped, carried through lift and swing, tipped out, and returned to the ground.",
  );
} finally {
  await browser.close();
}
