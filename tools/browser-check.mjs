import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
await mkdir(".local", { recursive: true });
const base = process.env.TRENCHCRAFT_TEST_URL ?? "http://127.0.0.1:5174/";
const browser = await chromium.launch({ channel: "msedge", headless: true });
try {
  const page = await browser.newPage({
      viewport: { width: 1440, height: 960 },
    }),
    errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(base, { waitUntil: "networkidle" });
  await page.locator("#loading").waitFor({ state: "hidden" });
  assert.equal(await page.locator("#panel").isVisible(), false);
  assert.equal(await page.locator("#left-stick .north").innerText(), "Arm out");
  assert.equal(
    await page.locator("#camera").innerText(),
    "Chase view",
    "starts in cab view",
  );
  assert.equal(await page.locator("#dig").getAttribute("aria-pressed"), "true");
  const cover = await browser.newPage();
  await cover.bringToFront();
  await page.bringToFront();
  assert.equal(
    await page.locator("#panel").isVisible(),
    false,
    "returning to the game must not open the guide",
  );
  await page.screenshot({ path: ".local/desktop.png" });
  await page.screenshot({ path: ".local/cab.png" });
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
  await cover.bringToFront();
  await page.bringToFront();
  assert.equal(
    await page.locator("#panel").isVisible(),
    true,
    "an explicitly opened guide stays open",
  );
  await cover.close();
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
  assert.equal(await page.locator("#camera").innerText(), "Cab view");
  await page.screenshot({ path: ".local/chase.png" });
  await page.locator("#guide").click();
  await page.locator("#pattern").selectOption("Alternate");
  await page.locator("#start").click();
  assert.equal(
    await page.locator("#left-stick .north").innerText(),
    "Boom down",
  );
  await page.reload({ waitUntil: "networkidle" });
  await page.locator("#loading").waitFor({ state: "hidden" });
  assert.equal(await page.locator("#panel").isVisible(), false);
  assert.equal(await page.locator("#camera").innerText(), "Chase view");
  assert.equal(await page.locator("#left-stick .north").innerText(), "Arm out");
  await page.locator("#guide").click();
  const beforeDrive = await page.evaluate(
    () => JSON.parse(localStorage.getItem("trenchcraft-save-v1")).machine,
  );
  await page.locator("#start").click();
  await page.locator("#travel").click();
  assert.equal(await page.locator("#left-stick .north").innerText(), "Forward");
  await page.keyboard.down("KeyW");
  await page.keyboard.down("ArrowUp");
  await page.waitForTimeout(900);
  await page.keyboard.up("KeyW");
  await page.keyboard.up("ArrowUp");
  await page.locator("#guide").click();
  const afterDrive = await page.evaluate(
    () => JSON.parse(localStorage.getItem("trenchcraft-save-v1")).machine,
  );
  assert.ok(
    afterDrive.z < beforeDrive.z - 0.5,
    "both track levers physically drive forward",
  );
  assert.equal(afterDrive.boom, beforeDrive.boom);
  assert.equal(afterDrive.stick, beforeDrive.stick);
  await page.locator("#start").click();
  await page.locator("#dig").click();
  assert.equal(await page.locator("#left-stick .north").innerText(), "Arm out");
  const mobile = await browser.newPage({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  mobile.on("pageerror", (e) => errors.push(e.message));
  await mobile.goto(base, { waitUntil: "networkidle" });
  await mobile.locator("#loading").waitFor({ state: "hidden" });
  assert.equal(await mobile.locator("#panel").isVisible(), false);
  assert.equal(await mobile.locator("#camera").innerText(), "Chase view");
  assert.equal(
    await mobile.locator("#left-stick .north").innerText(),
    "Arm out",
  );
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
