import { mkdirSync } from "node:fs";
import { chromium } from "@playwright/test";

const outDir = "docs/demo";
mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 1280, height: 800 },
  recordVideo: { dir: outDir, size: { width: 1280, height: 800 } },
});
const page = await context.newPage();
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

await page.goto("http://127.0.0.1:4521");
await page.waitForTimeout(12000);
await page.getByRole("button", { name: /Sintel 52s/ }).click();
await page.waitForFunction(() => Boolean(window.__lazyHands));
await page.waitForFunction(() => {
  const v = document.querySelector("video");
  return Boolean(v && v.readyState >= 2 && v.duration > 10);
});
await page.evaluate(async () => {
  const video = document.querySelector("video");
  if (!video) return;
  await new Promise((resolve) => {
    video.addEventListener("seeked", () => resolve(null), { once: true });
    video.currentTime = 18;
  });
});
await page.waitForTimeout(1200);
await page.evaluate(() => window.__lazyHands?.pose("open_palm", 220));
await page.waitForTimeout(2200);
await page.evaluate(() => window.__lazyHands?.swipe("right"));
await page.waitForTimeout(2000);
await page.evaluate(() => window.__lazyHands?.propose("skip_intro"));
await page.waitForTimeout(1600);
for (let i = 0; i < 10; i++) {
  await page.evaluate(() => window.__lazyHands?.pose("thumbs_up", 90));
  await page.waitForTimeout(90);
}
await page.waitForTimeout(2500);
await page.evaluate(() => {
  window.__lazyHands?.setTime(6);
  window.__lazyHands?.missKey();
});
await page.waitForTimeout(2000);
await page.evaluate(() => {
  window.__lazyHands?.setTime(22);
  window.__lazyHands?.missKey();
});
await page.waitForTimeout(5000);
await page.evaluate(() => window.__lazyHands?.propose("note_todo"));
await page.waitForTimeout(1500);
for (let i = 0; i < 10; i++) {
  await page.evaluate(() => window.__lazyHands?.pose("open_palm", 90));
  await page.waitForTimeout(90);
}
await page.waitForTimeout(20000);

const video = page.video();
await context.close();
if (video) {
  const raw = await video.path();
  const { copyFileSync } = await import("node:fs");
  copyFileSync(raw, "docs/demo/lazy-hands-demo.webm");
  console.log("wrote docs/demo/lazy-hands-demo.webm from", raw);
}
await browser.close();
