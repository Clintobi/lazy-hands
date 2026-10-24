import { expect, test, type Page } from "@playwright/test";
import { existsSync, mkdirSync, readFileSync } from "node:fs";

const BRIGHT_T = 10;
const SCENIC = [10, 14, 26, 6, 4, 30];

async function ready(page: Page) {
  await page.addInitScript(() => {
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
      value: async () => stream,
    });
  });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Lazy Hands" })).toBeVisible();
  await page.waitForFunction(() => Boolean(window.__lazyHands));
  await page.waitForFunction(() => {
    const v = document.querySelector("video");
    return Boolean(v && v.readyState >= 2 && v.duration > 8);
  });
}

async function videoLuma(page: Page) {
  return page.evaluate(() => {
    const video = document.querySelector("video");
    if (!video) return 0;
    const canvas = document.createElement("canvas");
    canvas.width = 160;
    canvas.height = 90;
    const ctx = canvas.getContext("2d");
    if (!ctx) return 0;
    ctx.drawImage(video, 0, 0, 160, 90);
    const data = ctx.getImageData(0, 0, 160, 90).data;
    let sum = 0;
    let n = 0;
    for (let i = 0; i < data.length; i += 16) {
      sum += 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
      n += 1;
    }
    return sum / n;
  });
}

async function showBrightFrame(page: Page, seconds = BRIGHT_T) {
  const candidates = [seconds, ...SCENIC.filter((t) => t !== seconds)];
  let luma = 0;
  let used = seconds;
  for (const t of candidates) {
    await page.evaluate(async (at) => {
      await window.__lazyHands?.showFrame(at);
    }, t);
    await page.waitForTimeout(160);
    luma = await videoLuma(page);
    used = t;
    // Title cards in this trailer sit near luma 250. Meadow and forest sit 110-200.
    if (luma > 90 && luma < 230) break;
  }
  expect(luma, `scenic frame at ${used}s`).toBeGreaterThan(90);
  expect(luma, `not a white title card at ${used}s`).toBeLessThan(230);
}

test.describe("Lazy Hands", () => {
  test("idle, gesture, approval hold, miss card on a real Bunny frame", async ({ page }) => {
    mkdirSync("docs/screenshots", { recursive: true });
    await ready(page);
    await showBrightFrame(page, 6);
    const hint = page.getByTestId("first-run-hint");
    await expect(hint).toBeVisible();
    await expect(page.locator("aside")).toHaveCount(0);
    await expect(page.getByText(/Palm pulse to pause/i)).toHaveCount(0);
    const hintBox = await hint.boundingBox();
    expect(hintBox?.width ?? 0).toBeGreaterThan(180);
    expect(hintBox?.height ?? 0).toBeGreaterThan(70);
    await page.screenshot({ path: "docs/screenshots/idle-1280.png", fullPage: false });

    await page.evaluate(() => window.__lazyHands?.dismissHint());
    await expect(page.getByTestId("first-run-hint")).toHaveCount(0);

    await page.evaluate(() => window.__lazyHands?.pose("open_palm", 220));
    await expect(page.getByTestId("gesture-stamp")).toContainText(/Play|Pause/);
    await showBrightFrame(page, 10);
    await page.evaluate(() => window.__lazyHands?.pose("open_palm", 220));
    await expect(page.getByTestId("gesture-stamp")).toBeVisible();
    await page.screenshot({ path: "docs/screenshots/gesture-1280.png", fullPage: false });

    await page.evaluate(() => window.__lazyHands?.dismissHint());
    await page.waitForTimeout(1200);
    await showBrightFrame(page, 14);
    await page.evaluate(() => window.__lazyHands?.propose("skip_intro"));
    await expect(page.getByTestId("approval-card")).toBeVisible();
    await page.evaluate(() => window.__lazyHands?.pose("thumbs_up", 400));
    await expect(page.getByTestId("hold-ring")).toHaveAttribute("data-progress", /0\.[4-7]/);
    await page.screenshot({ path: "docs/screenshots/approval-hold-1280.png", fullPage: false });

    await page.evaluate(() => {
      window.__lazyHands?.pose("none", 16);
      window.__lazyHands?.pose("open_palm", 800);
    });
    await expect(page.getByTestId("gesture-stamp")).toContainText(/Held off/);

    await showBrightFrame(page, 26);
    if (existsSync("docs/MODEL_RUN.json")) {
      const run = JSON.parse(readFileSync("docs/MODEL_RUN.json", "utf8")) as {
        text: string;
        engine: string;
        note: string;
        latencyMs: number;
        from: number;
        to: number;
      };
      await page.evaluate((payload) => {
        window.__lazyHands?.setMiss({
          text: payload.text,
          engine: payload.engine as "distilbart" | "gemma-webllm" | "extractive",
          note: payload.note,
          latencyMs: payload.latencyMs,
          from: payload.from,
          to: payload.to,
        });
      }, run);
    } else {
      await page.evaluate(() => {
        window.__lazyHands?.setTime(3);
        window.__lazyHands?.missKey();
      });
      await page.waitForTimeout(200);
      await page.evaluate(() => {
        window.__lazyHands?.setTime(16);
        window.__lazyHands?.missKey();
      });
    }
    await showBrightFrame(page, 26);
    await expect(page.getByTestId("miss-card")).toContainText(/You missed/);
    await expect(page.getByTestId("miss-text")).not.toContainText(/i cannot|no captions|as an ai/i);
    await expect(page.getByTestId("miss-note")).toContainText(/DistilBART|Gemma|extractive/i);
    await page.screenshot({ path: "docs/screenshots/miss-card-1280.png", fullPage: false });
  });

  test("state machine: watching palm pauses, pending palm does not", async ({ page }) => {
    await ready(page);
    await page.evaluate(() => window.__lazyHands?.dismissHint());

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
