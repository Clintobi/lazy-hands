import { mkdirSync, existsSync, readFileSync, copyFileSync } from "node:fs";
import { chromium } from "@playwright/test";
import { execFileSync } from "node:child_process";

const outDir = "docs/demo";
mkdirSync(outDir, { recursive: true });
mkdirSync("/opt/cursor/artifacts", { recursive: true });

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
await page.waitForFunction(() => Boolean(window.__lazyHands));
await page.waitForFunction(() => {
  const v = document.querySelector("video");
  return Boolean(v && v.readyState >= 2 && v.duration > 8);
});

async function show(t = 10) {
  await page.evaluate(async (seconds) => {
    await window.__lazyHands?.showFrame(seconds);
  }, t);
}

async function playFrom(t, ms) {
  await page.evaluate(async (seconds) => {
    const video = document.querySelector("video");
    if (!video) return;
    video.muted = true;
    video.currentTime = seconds;
    await video.play().catch(() => undefined);
  }, t);
  await page.waitForTimeout(ms);
}

await page.evaluate(() => window.__lazyHands?.lockAutoPropose());
await show(6);
await page.waitForTimeout(10000);
await page.getByRole("button", { name: "Got it" }).click().catch(() => undefined);
await page.waitForTimeout(1500);
await playFrom(4.2, 2800);
await page.evaluate(() => window.__lazyHands?.pose("open_palm", 220));
await page.waitForTimeout(3500);
await show(10);
await page.evaluate(() => window.__lazyHands?.swipe("right"));
await page.waitForTimeout(3000);
await show(14);
await page.evaluate(() => window.__lazyHands?.propose("skip_intro"));
await page.waitForTimeout(2500);
for (let i = 0; i < 5; i++) {
  await page.evaluate(() => window.__lazyHands?.pose("thumbs_up", 70));
  await page.waitForTimeout(70);
}
await page.evaluate(() => window.__lazyHands?.pose("thumbs_up", 800));
await page.waitForFunction(() => window.__lazyHands?.getState()?.mode === "watching");
await page.waitForTimeout(2500);
await show(10);
await page.evaluate(() => {
  window.__lazyHands?.pose("none", 16);
  window.__lazyHands?.propose("bookmark");
});
await page.waitForTimeout(2500);
for (let i = 0; i < 5; i++) {
  await page.evaluate(() => window.__lazyHands?.pose("open_palm", 70));
  await page.waitForTimeout(70);
}
await page.evaluate(() => window.__lazyHands?.pose("open_palm", 800));
await page.waitForFunction(() => window.__lazyHands?.getState()?.mode === "watching");
await page.waitForTimeout(2500);
await show(26);
if (existsSync("docs/MODEL_RUN.json")) {
  const run = JSON.parse(readFileSync("docs/MODEL_RUN.json", "utf8"));
  await page.evaluate((payload) => {
    window.__lazyHands?.setMiss({
      text: payload.text,
      engine: payload.engine,
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
  await page.waitForTimeout(300);
  await page.evaluate(() => {
    window.__lazyHands?.setTime(16);
    window.__lazyHands?.missKey();
  });
}
await page.waitForTimeout(16000);
await playFrom(26, 4000);
await show(30);
await page.waitForTimeout(9000);

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
    "docs/demo/lazy-hands-demo.mp4",
  ]);
  copyFileSync("docs/demo/lazy-hands-demo.mp4", "/opt/cursor/artifacts/lazy_hands_demo.mp4");
  const probe = execFileSync(
    "ffprobe",
    ["-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", "docs/demo/lazy-hands-demo.mp4"],
    { encoding: "utf8" },
  ).trim();
  console.log("wrote docs/demo/lazy-hands-demo.mp4 duration", probe, "from", raw);
}
