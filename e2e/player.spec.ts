import { expect, test, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";

async function ready(page: Page) {
  await page.addInitScript(() => {
    class FakeStream extends MediaStream {}
    const canvas = document.createElement("canvas");
    canvas.width = 320;
    canvas.height = 240;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.fillStyle = "#c4a574";
      ctx.fillRect(0, 0, 320, 240);
    }
    const stream = canvas.captureStream(8);
    Object.defineProperty(navigator.mediaDevices, "getUserMedia", {
      configurable: true,
      value: async () => stream ?? new FakeStream(),
    });
  });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Lazy Hands" })).toBeVisible();
}

test.describe("Lazy Hands", () => {
  test("idle screen, sample, gesture, approval hold, miss card", async ({ page }) => {
    mkdirSync("docs/screenshots", { recursive: true });
    await ready(page);

    await page.screenshot({ path: "docs/screenshots/idle-1280.png", fullPage: false });

    await page.getByRole("button", { name: /Sintel/ }).first().click();
    await expect(page.getByText(/copyright Blender Foundation/)).toBeVisible();
    await page.waitForFunction(() => Boolean(window.__lazyHands));

    await page.evaluate(() => {
      window.__lazyHands?.pose("open_palm", 220);
    });
    await expect(page.getByTestId("gesture-stamp")).toContainText(/Play|Pause/);
    await page.screenshot({ path: "docs/screenshots/gesture-1280.png", fullPage: false });

    await page.evaluate(() => {
      window.__lazyHands?.propose("skip_intro");
      window.__lazyHands?.pose("thumbs_up", 400);
    });
    await expect(page.getByTestId("approval-card")).toBeVisible();
    await expect(page.getByTestId("hold-ring")).toHaveAttribute("data-progress", /0\.[4-7]/);
    await page.screenshot({ path: "docs/screenshots/approval-hold-1280.png", fullPage: false });

    await page.evaluate(() => {
      window.__lazyHands?.pose("none", 16);
      window.__lazyHands?.pose("open_palm", 800);
    });
    await expect(page.getByTestId("approval-card")).toHaveCount(0);

    await page.evaluate(() => {
      window.__lazyHands?.setTime(2);
      window.__lazyHands?.missKey();
      window.__lazyHands?.setTime(12);
      window.__lazyHands?.missKey();
    });
    await expect(page.getByTestId("miss-card")).toContainText(/You missed/);
    await page.screenshot({ path: "docs/screenshots/miss-card-1280.png", fullPage: false });
  });

  test("state machine: watching palm pauses, pending palm does not", async ({ page }) => {
    await ready(page);
    await page.getByRole("button", { name: /Big Buck Bunny/ }).first().click();
    await page.waitForFunction(() => Boolean(window.__lazyHands));

    await page.evaluate(() => window.__lazyHands?.pose("open_palm", 200));
    const afterWatch = await page.evaluate(() => window.__lazyHands?.getState());
    expect(afterWatch?.mode).toBe("watching");
    expect(["playing", "paused"]).toContain(afterWatch?.playback);

    await page.evaluate(() => window.__lazyHands?.propose("bookmark"));
    const pending = await page.evaluate(() => window.__lazyHands?.getState());
    expect(pending?.mode).toBe("approval_pending");
    const playback = pending?.playback;

    await page.evaluate(() => window.__lazyHands?.pose("open_palm", 200));
    const still = await page.evaluate(() => window.__lazyHands?.getState());
    expect(still?.mode).toBe("approval_pending");
    expect(still?.playback).toBe(playback);
    expect(still?.holdIntent).toBe("reject");
    expect(still?.holdProgress ?? 0).toBeGreaterThan(0.1);
    expect(still?.holdProgress ?? 0).toBeLessThan(1);
  });
});
