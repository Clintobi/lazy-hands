import { describe, expect, it } from "vitest";
import { phraseProposal } from "@/lib/proposals";
import {
  HOLD_MS,
  PALM_PULSE_MS,
  holdProgress,
  initialSession,
  reduceSession,
} from "@/lib/session";

function step(
  state: ReturnType<typeof initialSession>,
  event: Parameters<typeof reduceSession>[1],
  now: number,
  videoTime = 0,
) {
  return reduceSession(state, event, now, videoTime);
}

describe("watching vs approval_pending", () => {
  it("pulses an open palm into play while watching", () => {
    let s = initialSession(0);
    const first = step(s, { type: "pose", pose: "open_palm", dt: PALM_PULSE_MS }, 10);
    s = first.state;
    expect(s.mode).toBe("watching");
    expect(s.playback).toBe("playing");
    expect(first.effects.some((e) => e.type === "toggle_playback")).toBe(true);
  });

  it("does not pause when a palm is held during an approval", () => {
    let s = initialSession(0);
    s = step(s, { type: "propose", proposal: phraseProposal("skip_intro", { introEnd: 8 }) }, 20).state;
    expect(s.mode).toBe("approval_pending");
    const next = step(s, { type: "pose", pose: "open_palm", dt: PALM_PULSE_MS }, 40);
    expect(next.state.playback).toBe("paused");
    expect(next.effects.some((e) => e.type === "toggle_playback")).toBe(false);
    expect(next.state.approval?.hold?.intent).toBe("reject");
  });

  it("requires a full hold before approve", () => {
    let s = initialSession(0);
    s = step(s, { type: "propose", proposal: phraseProposal("bookmark", { videoTime: 12 }) }, 30).state;
    const short = step(s, { type: "pose", pose: "thumbs_up", dt: HOLD_MS - 80 }, 40);
    expect(short.state.mode).toBe("approval_pending");
    expect(short.effects.some((e) => e.type === "apply_proposal")).toBe(false);
    expect(holdProgress(short.state)).toBeGreaterThan(0.8);
    expect(holdProgress(short.state)).toBeLessThan(1);

    const done = step(short.state, { type: "pose", pose: "thumbs_up", dt: 120 }, 200);
    expect(done.state.mode).toBe("watching");
    expect(done.effects.some((e) => e.type === "apply_proposal")).toBe(true);
    expect(done.state.log[0]?.decision).toBe("approved");
  });

  it("rejects on a held palm and logs it", () => {
    let s = initialSession(0);
    s = step(s, { type: "propose", proposal: phraseProposal("note_todo", { videoTime: 9 }) }, 10).state;
    const done = step(s, { type: "pose", pose: "open_palm", dt: HOLD_MS }, 20);
    expect(done.state.mode).toBe("watching");
    expect(done.effects.some((e) => e.type === "apply_proposal")).toBe(false);
    expect(done.state.log[0]?.decision).toBe("rejected");
  });

  it("resets a hold when the pose drops", () => {
    let s = initialSession(0);
    s = step(s, { type: "propose", proposal: phraseProposal("toggle_captions") }, 10).state;
    s = step(s, { type: "pose", pose: "thumbs_up", dt: 400 }, 20).state;
    expect(holdProgress(s)).toBeCloseTo(0.5, 1);
    s = step(s, { type: "pose", pose: "none", dt: 16 }, 40).state;
    expect(s.approval?.hold).toBeNull();
    expect(s.mode).toBe("approval_pending");
  });

  it("keeps swipe available during an approval", () => {
    let s = initialSession(0);
    s = step(s, { type: "propose", proposal: phraseProposal("summarise_recent") }, 10).state;
    const sw = step(s, { type: "swipe", dir: "right" }, 20);
    expect(sw.state.mode).toBe("approval_pending");
    expect(sw.effects.some((e) => e.type === "seek" && e.seconds === 10)).toBe(true);
  });
});

describe("false approvals", () => {
  it("never approves from palm, none, or a short thumb", () => {
    const proposal = phraseProposal("skip_intro", { introEnd: 4 });
    const sequences: Parameters<typeof reduceSession>[1][][] = [
      [{ type: "pose", pose: "none", dt: 900 }],
      [{ type: "pose", pose: "open_palm", dt: 900 }],
      [
        { type: "pose", pose: "thumbs_up", dt: 200 },
        { type: "pose", pose: "none", dt: 20 },
      ],
      [
        { type: "pose", pose: "thumbs_up", dt: 300 },
        { type: "pose", pose: "open_palm", dt: 900 },
      ],
    ];

    let falseApprovals = 0;
    for (const seq of sequences) {
      let s = step(initialSession(0), { type: "propose", proposal }, 1).state;
      for (const [i, ev] of seq.entries()) {
        const out = step(s, ev, 10 + i * 30);
        s = out.state;
        if (out.effects.some((e) => e.type === "apply_proposal")) falseApprovals += 1;
      }
    }
    expect(falseApprovals).toBe(0);
  });
});

describe("look away", () => {
  it("summarises after a long gap, not a blink", () => {
    let s = initialSession(0);
    s = step(s, { type: "play" }, 1).state;
    const blink = step(s, { type: "face", visible: false, dt: 200, videoTime: 3 }, 20, 3);
    expect(blink.state.attention).toBe("present");
    let away = step(blink.state, { type: "face", visible: false, dt: 900, videoTime: 4 }, 40, 4).state;
    expect(away.attention).toBe("away");
    const back = step(away, { type: "face", visible: true, dt: 20, videoTime: 12 }, 80, 12);
    expect(back.effects.some((e) => e.type === "summarise")).toBe(true);
  });

  it("toggles away with the miss key", () => {
    let s = initialSession(0);
    s = step(s, { type: "miss_key", videoTime: 2 }, 10, 2).state;
    expect(s.attention).toBe("away");
    const back = step(s, { type: "miss_key", videoTime: 10 }, 20, 10);
    expect(back.state.attention).toBe("present");
    expect(back.effects[0]).toMatchObject({ type: "summarise", from: 2, to: 10 });
  });
});
