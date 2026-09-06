import { chromium } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
await mkdir(".local", { recursive: true });
const loaded = process.argv.includes("--loaded");
const tag = process.argv[2] || "after";
const browser = await chromium.launch({ channel: "msedge", headless: true });
try {
  const results = [];
  for (const viewport of [
    { width: 390, height: 844 },
    { width: 1024, height: 768 },
  ]) {
    const page = await browser.newPage({ viewport, deviceScaleFactor: 2 });
    await page.route("**/terrain-benchmark", (r) =>
      r.fulfill({
        contentType: "text/html",
        body: `<style>body{margin:0}</style><canvas></canvas><script type="module">import {Simulation,cellPosition} from '/src/simulation.ts';import {View} from '/src/view.ts';const sim=new Simulation(),view=new View(document.querySelector('canvas'),sim);await view.load();window.review={sim,view,cellPosition};</script>`,
      }),
    );
    await page.goto("http://127.0.0.1:5174/terrain-benchmark");
    await page.waitForFunction(() => window.review);
    const metrics = await page.evaluate(async (loaded) => {
      const { sim, view, cellPosition } = window.review;
      for (let i = 0; i < sim.ground.length; i++) {
        const { x, z } = cellPosition(i);
        const trench = Math.abs(x) < 0.6 && z < -1.5 && z > -8 ? -0.7 : 0;
        const pile =
          x > 1.6 && x < 5 && z < -1.5 && z > -8
            ? 0.6 *
              Math.exp(-((x - 3.2) ** 2) / 0.5) *
              (1 + 0.2 * Math.sin(z * 3))
            : 0;
        sim.ground[i] = trench + pile;
        sim.deepest[i] = trench;
        sim.changed.add(i);
      }
      sim.machine.load = loaded ? 0.22 : 0;
      sim.machine.boom = 1;
      sim.machine.stick = -1.1;
      sim.machine.bucket = 0.6;
      view.render(0, 0);
      const cpu = [],
        frames = [];
      let last = 0;
      // A repeatable edit patch plus the full bounded in-flight soil population.
      for (let frame = 0; frame < 210; frame++) {
        await new Promise((resolve) =>
          requestAnimationFrame((t) => {
            if (frame > 30) frames.push(t - last);
            last = t;
            resolve();
          }),
        );
        const start = performance.now();
        sim.machine.swing = Math.sin(frame * 0.02) * 0.5;
        sim.falling.length = 0;
        for (let j = 0; j < 64; j++)
          sim.falling.push({
            x: 2.8 + Math.sin(j) * 0.35,
            z: -3 + j * 0.02,
            y: 0.6 + ((j + frame) % 30) * 0.07,
            vx: 0,
            vy: 0,
            vz: 0,
            volume: 0.003,
          });
        for (let z = 24; z < 31; z++)
          for (let x = 46; x < 53; x++) {
            const i = z * 72 + x;
            sim.ground[i] =
              0.3 + 0.15 * Math.sin(frame * 0.08 + x * 0.3 + z * 0.4);
            sim.changed.add(i);
          }
        sim.dust.push({ x: 2.8, y: 0.7, z: -3, dump: true });
        view.render(1 / 60, frame / 60);
        if (frame > 30) cpu.push(performance.now() - start);
      }
      const percentile = (a, p) =>
        a.sort((x, y) => x - y)[Math.floor(a.length * p)];
      return {
        cpuP50: percentile(cpu, 0.5),
        cpuP95: percentile(cpu, 0.95),
        frameP50: percentile(frames, 0.5),
        frameP95: percentile(frames, 0.95),
        ...view.renderer.info.render,
        geometries: view.renderer.info.memory.geometries,
        textures: view.renderer.info.memory.textures,
        pixelRatio: view.renderer.getPixelRatio(),
        loaded,
      };
    }, loaded);
    await page.screenshot({
      path: `.local/terrain-${tag}-${viewport.width}.png`,
    });
    results.push({ viewport, ...metrics });
    await page.close();
  }
  await writeFile(
    `.local/terrain-${tag}.json`,
    JSON.stringify(results, null, 2),
  );
  console.log(JSON.stringify(results, null, 2));
} finally {
  await browser.close();
}
