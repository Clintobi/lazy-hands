import { writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { classifyPose, detectSwipe } from "@/lib/gestures";
import { makeHand, swipeFrames } from "@/lib/landmarks";

const cases: { name: string; pose: "open_palm" | "thumbs_up" | "none"; jitter?: number }[] = [
  ...Array.from({ length: 12 }, (_, i) => ({
    name: `palm-${i}`,
    pose: "open_palm" as const,
    jitter: i * 0.004,
  })),
  ...Array.from({ length: 12 }, (_, i) => ({
    name: `thumb-${i}`,
    pose: "thumbs_up" as const,
    jitter: i * 0.004,
  })),
  ...Array.from({ length: 8 }, (_, i) => ({ name: `none-fist-${i}`, pose: "none" as const, jitter: i * 0.003 })),
  ...Array.from({ length: 8 }, (_, i) => ({ name: `none-point-${i}`, pose: "none" as const, jitter: i * 0.003 })),
];

function fixture(name: string, i: number) {
  if (name.startsWith("none-fist")) {
    return makeHand("fist", { wristX: 0.48 + i * 0.002, wristY: 0.6 });
  }
  if (name.startsWith("none-point")) {
    return makeHand("point", { wristX: 0.52 - i * 0.002, wristY: 0.58 });
  }
  if (name.startsWith("palm")) {
    return makeHand("open_palm", { wristX: 0.5 + (i % 3) * 0.01, wristY: 0.61 });
  }
  return makeHand("thumbs_up", { wristX: 0.49 + (i % 3) * 0.008, wristY: 0.63 });
}

describe("pose classification", () => {
  const rows: { name: string; expected: string; got: string; ms: number }[] = [];

  it("separates thumbs-up, open palm, and none", () => {
    let ok = 0;
    for (const [i, c] of cases.entries()) {
      const hand = fixture(c.name, i);
      const started = performance.now();
      const got = classifyPose(hand.landmarks);
      rows.push({ name: c.name, expected: c.pose, got: got.pose, ms: got.latencyMs || performance.now() - started });
      if (got.pose === c.pose) ok += 1;
    }
    const accuracy = ok / cases.length;
    expect(accuracy).toBeGreaterThanOrEqual(0.95);

    const palmAsThumb = rows.filter((r) => r.expected === "open_palm" && r.got === "thumbs_up").length;
    const noneAsThumb = rows.filter((r) => r.expected === "none" && r.got === "thumbs_up").length;
    const falseThumbRate = (palmAsThumb + noneAsThumb) / rows.filter((r) => r.expected !== "thumbs_up").length;
    expect(falseThumbRate).toBeLessThanOrEqual(0.05);

    writeFileSync(
      "docs/gesture-confusion.json",
      JSON.stringify({ accuracy, falseThumbRate, rows }, null, 2),
    );
  });
});

describe("swipes", () => {
  it("reads a left swipe from wrist travel", () => {
    const result = detectSwipe(swipeFrames("left"));
    expect(result.swipe).toBe("swipe_left");
  });

  it("reads a right swipe from wrist travel", () => {
    const result = detectSwipe(swipeFrames("right"));
    expect(result.swipe).toBe("swipe_right");
  });

  it("ignores a still hand", () => {
    const frames = Array.from({ length: 8 }, (_, i) => makeHand("open_palm", { t: i * 30 }));
    expect(detectSwipe(frames).swipe).toBeNull();
  });
});
