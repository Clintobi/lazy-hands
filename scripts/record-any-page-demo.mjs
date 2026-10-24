import { mkdirSync, copyFileSync } from "node:fs";
import { chromium } from "@playwright/test";
import { execFileSync } from "node:child_process";

mkdirSync("docs/demo", { recursive: true });
mkdirSync("/opt/cursor/artifacts", { recursive: true });

const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 1280, height: 800 },
  recordVideo: { dir: "docs/demo", size: { width: 1280, height: 800 } },
});
const page = await context.newPage();
await page.addInitScript(() => {
  const canvas = document.createElement("canvas");
  canvas.width = 320;
  canvas.height = 240;
  Object.defineProperty(navigator.mediaDevices, "getUserMedia", {
    configurable: true,
    value: async () => canvas.captureStream(8),
  });
});
await page.goto("http://127.0.0.1:4521/watch");
await page.waitForFunction(() => Boolean(window.__lazyHands));
await page.waitForFunction(() => {
  const v = document.querySelector("video");
  return Boolean(v && v.readyState >= 2);
});
await page.evaluate(async () => window.__lazyHands?.showFrame(6));
await page.waitForTimeout(6000);
await page.getByRole("button", { name: "Got it" }).click().catch(() => undefined);
await page.evaluate(async () => {
  const video = document.querySelector("video");
  if (video) {
    video.muted = true;
    video.currentTime = 4.2;
    await video.play().catch(() => undefined);
  }
});
await page.waitForTimeout(2800);
await page.evaluate(() => window.__lazyHands?.pose("open_palm", 220));
await page.waitForTimeout(2500);
await page.evaluate(async () => window.__lazyHands?.showFrame(10));
await page.evaluate(() => window.__lazyHands?.swipe("right"));
await page.waitForTimeout(2500);
await page.evaluate(async () => window.__lazyHands?.showFrame(14));
await page.evaluate(() => window.__lazyHands?.ask("echo ship-it"));
await page.waitForTimeout(3000);
for (let i = 0; i < 5; i++) {
  await page.evaluate(() => window.__lazyHands?.pose("thumbs_up", 70));
  await page.waitForTimeout(70);
}
await page.evaluate(() => window.__lazyHands?.pose("thumbs_up", 800));
await page.waitForTimeout(8000);
await page.evaluate(async () => window.__lazyHands?.showFrame(26));
await page.waitForTimeout(6000);

const video = page.video();
await context.close();
await browser.close();
if (video) {
  const raw = await video.path();
  execFileSync("ffmpeg", [
    "-y",
    "-i",
    raw,
    "-an",
    "-c:v",
    "libx264",
    "-pix_fmt",
    "yuv420p",
    "-crf",
    "23",
    "-movflags",
    "+faststart",
    "docs/demo/lazy-hands-any-page.mp4",
  ]);
  copyFileSync("docs/demo/lazy-hands-any-page.mp4", "/opt/cursor/artifacts/lazy_hands_any_page.mp4");
  const dur = execFileSync(
    "ffprobe",
    ["-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", "docs/demo/lazy-hands-any-page.mp4"],
    { encoding: "utf8" },
  ).trim();
  console.log("wrote any-page demo", dur);
}
