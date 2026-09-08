import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { Simulation } from "../src/simulation.ts";

const base = process.env.TRENCHCRAFT_TEST_URL ?? "http://127.0.0.1:5174/";
await mkdir(".local", { recursive: true });
const browser = await chromium.launch({ channel: "msedge", headless: true });
try {
  for (const [name, height, x, expected] of [
    ["shallow", -0.3, 0, "Dig 30 cm deeper"],
    ["target", -0.6, 0, "Target reached here"],
    ["deep", -0.8, 0, "20 cm too deep"],
    ["outside", -0.6, 4, "Move over the chalk trench"],
  ]) {
    const sim = new Simulation();
    sim.ground.fill(height);
    sim.deepest.fill(height);
    sim.machine.x = x;
    sim.machine.boom = 1.2;
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.addInitScript((save) => localStorage.setItem("trenchcraft-save-v1", JSON.stringify(save)), sim.snapshot());
    await page.goto(base, { waitUntil: "networkidle" });
    await page.locator("#loading").waitFor({ state: "hidden" });
    assert.ok((await page.locator("#grade-status").innerText()).includes(expected));
    assert.equal(await page.locator("#floor-depth").innerText(), x ? "—" : `${Math.round(-height * 100)} cm`);
    for (const [width, height] of [[390, 844], [320, 568], [640, 360], [1100, 850]]) {
      await page.setViewportSize({ width, height });
      await page.screenshot({ path: `.local/grade-${name}-${width}.png` });
      const bounds = await page.locator(".bucket-status, .job, .hint, .joystick, .track-control").evaluateAll((els) => els.map((el) => {
        const r = el.getBoundingClientRect();
        return { name: el.className, x: r.x, y: r.y, w: r.width, h: r.height };
      }));
      const card = bounds.find((b) => b.name === "bucket-status");
      assert.ok(card.x >= 0 && card.y >= 0 && card.x + card.w <= width && card.y + card.h <= height);
      for (const b of bounds.filter((b) => b !== card))
        assert.ok(card.x + card.w <= b.x || b.x + b.w <= card.x || card.y + card.h <= b.y || b.y + b.h <= card.y, `${name} ${width}: depth card overlaps ${b.name}: ${JSON.stringify({card, other: b})}`);
    }
    assert.deepEqual(errors, []);
    await page.close();
  }
  console.log(`PASS: floor depth, reached/too-deep/off-line states and card layout (${base})`);
} finally {
  await browser.close();
}
