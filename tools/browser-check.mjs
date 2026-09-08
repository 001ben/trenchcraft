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
  assert.equal(await page.locator("#dig, #travel, #map").count(), 0);
  assert.equal(await page.locator(".track-control").count(), 2);
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
  await page.setViewportSize({ width: 960, height: 720 });
  await page.locator("#guide").click();
  await page.locator("#start").click();
  assert.equal(
    await page.locator("#camera").innerText(),
    "Cab view",
    "guide and resize preserve chase view",
  );
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
  assert.equal(
    await page.locator("#camera").innerText(),
    "Cab view",
    "reloading the same tab preserves chase view",
  );
  assert.equal(await page.locator("#left-stick .north").innerText(), "Arm out");
  await page.locator("#guide").click();
  const beforeDrive = await page.evaluate(
    () => JSON.parse(localStorage.getItem("trenchcraft-save-v1")).machine,
  );
  await page.locator("#start").click();
  assert.equal(await page.locator("#left-stick .north").innerText(), "Arm out");
  await page.keyboard.down("KeyQ");
  await page.keyboard.down("KeyE");
  await page.waitForTimeout(900);
  await page.keyboard.up("KeyQ");
  await page.keyboard.up("KeyE");
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
  await mobile.locator("#guide").click();
  const centeredBefore = await mobile.evaluate(
    () => JSON.parse(localStorage.getItem("trenchcraft-save-v1")).machine,
  );
  await mobile.locator("#start").click();
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [p(1, l, 1, 1), p(2, r, -1, 1)],
  });
  await mobile.waitForTimeout(350);
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchCancel",
    touchPoints: [],
  });
  await mobile.locator("#guide").click();
  const centeredAfter = await mobile.evaluate(
    () => JSON.parse(localStorage.getItem("trenchcraft-save-v1")).machine,
  );
  assert.deepEqual(
    centeredAfter,
    centeredBefore,
    "resting thumbs inside the dead zone must not move the machine",
  );
  await mobile.locator("#start").click();
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
  await mobile.locator("#guide").click();
  const touchBefore = await mobile.evaluate(
    () => JSON.parse(localStorage.getItem("trenchcraft-save-v1")).machine,
  );
  await mobile.locator("#start").click();
  const tl = await mobile.locator("#left-track").boundingBox(),
    tr = await mobile.locator("#right-track").boundingBox();
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [p(3, tl, 0, -30), p(4, tr, 0, -30)],
  });
  await mobile.waitForTimeout(500);
  assert.equal(await mobile.locator(".track-control.active").count(), 2);
  await mobile.screenshot({ path: ".local/phone-travel.png" });
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchCancel",
    touchPoints: [],
  });
  assert.equal(await mobile.locator(".track-control.active").count(), 0);
  assert.equal(
    await mobile.locator("#left-track").getAttribute("aria-valuenow"),
    "0",
  );
  await mobile.locator("#guide").click();
  const touchAfter = await mobile.evaluate(
    () => JSON.parse(localStorage.getItem("trenchcraft-save-v1")).machine,
  );
  assert.ok(
    touchAfter.z < touchBefore.z - 0.2,
    "both touch travel levers move the chassis",
  );
  assert.equal(touchAfter.boom, touchBefore.boom);
  assert.equal(touchAfter.stick, touchBefore.stick);
  await mobile.locator("#start").click();
  for (const viewport of [
    { width: 390, height: 844 },
    { width: 844, height: 390 },
    { width: 1024, height: 768 },
    { width: 360, height: 640 },
    { width: 320, height: 568 },
    { width: 640, height: 360 },
  ]) {
    await mobile.setViewportSize(viewport);
    await mobile.waitForTimeout(400);
    const bounds = await mobile
      .locator(".joystick, .track-control")
      .evaluateAll((els) =>
        els.map((el) => {
          const r = el.getBoundingClientRect();
          return { x: r.x, y: r.y, w: r.width, h: r.height };
        }),
      );
    for (const [i, a] of bounds.entries()) {
      assert.ok(
        a.w >= 44 &&
          a.h >= 44 &&
          a.x >= 0 &&
          a.x + a.w <= viewport.width + 0.1 &&
          a.y + a.h <= viewport.height + 0.1,
        "thumb controls remain within the viewport",
      );
      for (const b of bounds.slice(i + 1))
        assert.ok(
          a.x + a.w <= b.x + 0.1 ||
            b.x + b.w <= a.x + 0.1 ||
            a.y + a.h <= b.y + 0.1 ||
            b.y + b.h <= a.y + 0.1,
          "thumb controls must not overlap",
        );
    }
    if (viewport.width < viewport.height && viewport.width <= 700) {
      const leftTravel = await mobile.locator("#left-track").boundingBox();
      const rightTravel = await mobile.locator("#right-track").boundingBox();
      const leftStick = await mobile.locator("#left-stick").boundingBox();
      assert.ok(
        leftTravel.width >= 60 && rightTravel.width >= 60,
        "travel controls have generous thumb targets",
      );
      assert.ok(
        rightTravel.x - leftTravel.x - leftTravel.width >= 90,
        "phone travel controls are separated",
      );
      assert.ok(
        leftTravel.y + leftTravel.height < leftStick.y - 12,
        "travel lever sits above its own stick",
      );
      const job = await mobile.locator(".job").boundingBox();
      const bucket = await mobile.locator(".bucket-status").boundingBox();
      const hint = await mobile.locator(".hint").boundingBox();
      assert.ok(
        job.x + job.width <= bucket.x || job.y + job.height <= bucket.y,
        "job and depth status do not overlap on short phones",
      );
      assert.ok(
        Math.max(job.y + job.height, bucket.y + bucket.height) <= hint.y,
        "hint clears the status panel",
      );
      assert.ok(
        hint.y + hint.height < leftTravel.y,
        "hint clears the travel controls",
      );
    }
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
  await mobile.keyboard.down("ArrowUp");
  await mobile.waitForTimeout(2500);
  await mobile.keyboard.up("ArrowUp");
  await mobile.screenshot({ path: ".local/downward-dig.png" });
  await mobile.locator("#guide").click();
  const lowered = await mobile.evaluate(() =>
    JSON.parse(localStorage.getItem("trenchcraft-save-v1")),
  );
  assert.ok(
    Math.min(...lowered.ground) < -0.15,
    "holding only boom-down excavates below the old 10 cm stop",
  );
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
