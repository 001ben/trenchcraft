import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { tooth, CELL } from "../src/simulation.ts";

// Run with node --import tsx tools/digging-check.mjs; accepts the hosted URL too.
const base = process.env.TRENCHCRAFT_TEST_URL ?? "http://127.0.0.1:5174/";
await mkdir(".local", { recursive: true });
const browser = await chromium.launch({ channel: "msedge", headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1100, height: 850 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(base, { waitUntil: "networkidle" });
  await page.locator("#loading").waitFor({ state: "hidden" });
  await page.locator("#guide").click();
  await page.addInitScript(() => {
    const save = JSON.parse(localStorage.getItem("trenchcraft-save-v1"));
    save.machine.bucket = -0.8;
    localStorage.setItem("trenchcraft-save-v1", JSON.stringify(save));
  });
  await page.reload({ waitUntil: "networkidle" });
  await page.locator("#loading").waitFor({ state: "hidden" });
  await page.bringToFront();
  const phases = [];
  for (const [name, keys, ms] of [
    ["penetrate", ["ArrowUp"], 1800],
    ["curl", ["ArrowLeft", "KeyS"], 1800],
    ["lift", ["ArrowDown"], 1600],
  ]) {
    for (const key of keys) await page.keyboard.down(key);
    await page.waitForTimeout(ms);
    for (const key of keys) await page.keyboard.up(key);
    await page.screenshot({ path: `.local/digging-${name}.png` });
    await page.locator("#guide").click();
    const save = await page.evaluate(() => JSON.parse(localStorage.getItem("trenchcraft-save-v1")));
    const volume = save.ground.reduce((v, h) => v + h * CELL * CELL, 0) +
      save.machine.load + save.falling.reduce((v, p) => v + p.volume, 0);
    assert.ok(Math.abs(volume) < 1e-6, `${name}: soil volume is conserved`);
    phases.push({ name, tip: tooth(save.machine), machine: save.machine, groundMin: Math.min(...save.ground) });
    await page.locator("#start").click();
  }
  assert.equal(phases[0].machine.bucket, -0.8, "the opened-bucket fixture survived reload");
  assert.ok(phases[0].tip.y < -0.25, "opened teeth penetrate beyond the old stop");
  assert.ok(phases[0].groundMin < -0.15, "penetration removes actual ground");
  assert.ok(phases[1].machine.bucket > phases[0].machine.bucket + 0.05, "curl remains usable");
  assert.ok(phases[1].tip.z > phases[0].tip.z + 0.1, "crowding advances the teeth");
  assert.ok(phases[2].tip.y > phases[1].tip.y + 0.3, "lifting escapes ground contact");
  assert.deepEqual(errors, []);
  await writeFile(".local/digging-result.json", JSON.stringify({ base, phases, errors }, null, 2));
  console.log(JSON.stringify({ base, phases, errors }));
} finally {
  await browser.close();
}
