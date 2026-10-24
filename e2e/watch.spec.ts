import { expect, test } from "@playwright/test";

test.describe("any page + approval bridge", () => {
  test("generic journal page drives the video and a waiting command", async ({ page }) => {
    await page.addInitScript(() => {
      const canvas = document.createElement("canvas");
      canvas.width = 320;
      canvas.height = 240;
      const stream = canvas.captureStream(8);
      Object.defineProperty(navigator.mediaDevices, "getUserMedia", {
        configurable: true,
        value: async () => stream,
      });
    });
    await page.goto("/watch");
    await page.waitForFunction(() => Boolean(window.__lazyHands));
    await page.waitForFunction(() => {
      const v = document.querySelector("video");
      return Boolean(v && v.readyState >= 2);
    });
    await page.evaluate(async () => window.__lazyHands?.showFrame(10));
    await expect(page.getByRole("heading", { name: "Evening reel, 24 Oct" })).toBeVisible();
    await expect(page.getByTestId("first-run-hint")).toBeVisible();
    await page.screenshot({ path: "docs/screenshots/generic-page-1280.png", fullPage: false });

    await page.evaluate(() => window.__lazyHands?.dismissHint());
    await page.evaluate(() => window.__lazyHands?.pose("open_palm", 220));
    await expect(page.getByTestId("gesture-stamp")).toBeVisible();
    await page.evaluate(async () => window.__lazyHands?.showFrame(10));
    await page.screenshot({ path: "docs/screenshots/generic-gesture-1280.png", fullPage: false });

    await page.evaluate(() => window.__lazyHands?.ask?.("echo ship-it"));
    await expect(page.getByTestId("approval-card")).toContainText(/Run this command/);
    await expect(page.getByTestId("bridge-term")).toContainText(/Waiting for a thumbs-up/);
    await page.evaluate(() => window.__lazyHands?.pose("thumbs_up", 400));
    await page.screenshot({ path: "docs/screenshots/bridge-waiting-1280.png", fullPage: false });
    await page.evaluate(() => window.__lazyHands?.pose("thumbs_up", 800));
    await expect(page.getByTestId("bridge-term")).toContainText(/Approved/);
    await page.screenshot({ path: "docs/screenshots/bridge-approved-1280.png", fullPage: false });
  });
});
