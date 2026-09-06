import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
await mkdir(".local", { recursive: true });
const browser = await chromium.launch({ channel: "msedge", headless: true });
try {
  const page = await browser.newPage({
      viewport: { width: 1440, height: 960 },
    }),
    errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("http://127.0.0.1:5174/", { waitUntil: "networkidle" });
  await page.locator("#start").click();
  await page.screenshot({ path: ".local/desktop.png" });
  await page.keyboard.down("ArrowUp");
  await page.waitForTimeout(530);
  await page.keyboard.up("ArrowUp");
  await page.keyboard.down("ArrowLeft");
  await page.keyboard.down("KeyS");
  await page.waitForTimeout(1000);
  await page.keyboard.up("ArrowLeft");
  await page.keyboard.up("KeyS");
  await page.locator("#guide").click();
  const scooped = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("trenchcraft-save-v1")),
  );
  assert.ok(scooped.machine.load > 0.003, "UI controls physically scoop");
  await page.locator("#start").click();
  await page.keyboard.down("ArrowDown");
  await page.waitForTimeout(1600);
  await page.keyboard.up("ArrowDown");
  await page.keyboard.down("KeyD");
  await page.waitForTimeout(1300);
  await page.keyboard.up("KeyD");
  await page.screenshot({ path: ".local/loaded-bucket.png" });
  await page.keyboard.down("ArrowRight");
  await page.waitForTimeout(3900);
  await page.keyboard.up("ArrowRight");
  await page.locator("#guide").click();
  const dumped = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("trenchcraft-save-v1")),
  );
  assert.ok(
    dumped.machine.load < scooped.machine.load / 2,
    "raised bucket visibly unloads",
  );
  assert.ok(
    dumped.ground.some((h) => h > 0),
    "soil mound exists",
  );
  await page.locator("#start").click();
  await page.screenshot({ path: ".local/dug-and-dumped.png" });
  await page.locator("#camera").click();
  await page.waitForTimeout(600);
  await page.screenshot({ path: ".local/cab.png" });
  await page.locator("#guide").click();
  await page.locator("#pattern").selectOption("Alternate");
  await page.locator("#start").click();
  assert.equal(
    await page.locator("#left-stick .north").innerText(),
    "Boom down",
  );
  await page.reload({ waitUntil: "networkidle" });
  await page.locator("#start").click();
  assert.equal(
    await page.locator("#left-stick .north").innerText(),
    "Boom down",
  );
  const mobile = await browser.newPage({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  mobile.on("pageerror", (e) => errors.push(e.message));
  await mobile.goto("http://127.0.0.1:5174/", { waitUntil: "networkidle" });
  await mobile.locator("#start").click();
  const cdp = await mobile.context().newCDPSession(mobile);
  const l = await mobile.locator("#left-stick").boundingBox(),
    r = await mobile.locator("#right-stick").boundingBox();
  const p = (id, b, dx, dy) => ({
    id,
    x: b.x + b.width / 2 + dx,
    y: b.y + b.height / 2 + dy,
    radiusX: 5,
    radiusY: 5,
    force: 1,
  });
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [p(1, l, 20, 0), p(2, r, 0, -20)],
  });
  await mobile.waitForTimeout(500);
  assert.equal(await mobile.locator(".joystick.active").count(), 2);
  await mobile.screenshot({ path: ".local/phone-dual-stick.png" });
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchCancel",
    touchPoints: [],
  });
  assert.equal(await mobile.locator(".joystick.active").count(), 0);
  for (const viewport of [
    { width: 390, height: 844 },
    { width: 844, height: 390 },
    { width: 1024, height: 768 },
    { width: 360, height: 640 },
  ]) {
    await mobile.setViewportSize(viewport);
    await mobile.waitForTimeout(400);
    assert.equal(
      await mobile.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
    );
    await mobile.screenshot({ path: `.local/layout-${viewport.width}.png` });
  }
  await mobile.locator("#guide").click();
  await mobile.locator("#reset").click();
  await mobile.locator("#reset-no").click();
  await mobile.locator("#reset").click();
  await mobile.locator("#reset-yes").click();
  await mobile.locator("#start").click();
  assert.match(await mobile.locator("#load").innerText(), /EMPTY/);
  assert.deepEqual(errors, []);
  await writeFile(
    ".local/browser-result.json",
    JSON.stringify(
      { errors, scooped: scooped.machine.load, dumped: dumped.machine.load },
      null,
      2,
    ),
  );
  console.log(
    "PASS: keyboard scoop/dump, terrain mound, cab view, save/reload, pattern switch, simultaneous touch and cancellation, portrait/landscape/tablet, reset.",
  );
} finally {
  await browser.close();
}
