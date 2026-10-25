import { describe, expect, it } from "vitest";
import { phraseAgentCommand, phrasePageConfirm, phraseProposal } from "@/lib/proposals";
import { HOLD_MS, requiredHoldMs } from "@/lib/session";
import { VideoController } from "@/lib/video-controller";
import type { VideoHandle } from "@/lib/video-controller";

function fakeVideo(partial: Partial<VideoHandle> = {}): VideoHandle {
  return {
    id: "main",
    className: "html5-main-video",
    clientWidth: 960,
    clientHeight: 540,
    duration: 200,
    currentTime: 12,
    paused: true,
    ended: false,
    readyState: 4,
    src: "/samples/bunny/clip.mp4",
    play() {
      this.paused = false;
    },
    pause() {
      this.paused = true;
    },
    ...partial,
  };
}

describe("VideoController on several page shapes", () => {
  it("toggles the chosen YouTube-shaped video with a short palm", () => {
    const thumbs = fakeVideo({
      id: "thumb",
      className: "ytp-preview",
      clientWidth: 160,
      clientHeight: 90,
      duration: 6,
    });
    const main = fakeVideo({ paused: true });
    const ctl = new VideoController();
    ctl.pickFrom([thumbs, main]);
    expect(ctl.video?.id).toBe("main");
    ctl.dispatch({ type: "pose", pose: "open_palm", dt: 200 }, 20);
    expect(main.paused).toBe(false);
    expect(ctl.publicState().stamp).toMatch(/Play/);
  });

  it("skips ten seconds on a Netflix-shaped player", () => {
    const feature = fakeVideo({
      className: "watch-video--player-view",
      currentTime: 40,
      hostHint: "netflix.com",
    });
    const ctl = new VideoController();
    ctl.attach(feature);
    ctl.dispatch({ type: "swipe", dir: "right" }, 10);
    expect(feature.currentTime).toBe(50);
  });

  it("builds a miss recap from page captions, not invented plot", () => {
    const video = fakeVideo({ currentTime: 16 });
    let recap = "";
    const ctl = new VideoController({
      onSummarise: (_f, _t, text) => {
        recap = text;
      },
    });
    ctl.attach(video);
    ctl.loadCaptions([
      {
        kind: "transcript",
        lines: ["Dawn in a forest.", "A huge rabbit wakes.", "The rodents steal an apple."],
      },
    ]);
    ctl.dispatch({ type: "miss_key", videoTime: 2 }, 10, 2);
    ctl.dispatch({ type: "miss_key", videoTime: 16 }, 20, 16);
    expect(recap.toLowerCase()).toMatch(/rabbit|forest|apple/);
    expect(recap.toLowerCase()).not.toMatch(/cannot/);
  });

  it("drives an iframe-shaped Vimeo embed when it is the only player", () => {
    const embed = fakeVideo({
      id: "vimeo-embed",
      className: "vp-video",
      clientWidth: 640,
      clientHeight: 360,
      inIframe: true,
      hostHint: "player.vimeo.com",
      currentTime: 20,
    });
    const ctl = new VideoController();
    ctl.pickFrom([embed]);
    expect(ctl.video?.id).toBe("vimeo-embed");
    ctl.dispatch({ type: "swipe", dir: "left" }, 4);
    expect(embed.currentTime).toBe(10);
  });

  it("does not click a page confirm without a full thumb hold", () => {
    let clicked = false;
    const ctl = new VideoController({
      clickConfirm: () => {
        clicked = true;
        return true;
      },
    });
    ctl.attach(fakeVideo());
    ctl.dispatch({ type: "propose", proposal: phrasePageConfirm("Approve", "#ok"), force: true }, 5);
    ctl.dispatch({ type: "pose", pose: "thumbs_up", dt: 200 }, 10);
    expect(clicked).toBe(false);
    expect(ctl.publicState().mode).toBe("approval_pending");
    ctl.dispatch({ type: "pose", pose: "thumbs_up", dt: HOLD_MS }, 20);
    expect(clicked).toBe(true);
  });
});

describe("approval bridge through the controller", () => {
  it("approves a waiting command after a full thumb hold", () => {
    const decisions: string[] = [];
    const ctl = new VideoController({
      onDecision: (_p, decision) => decisions.push(decision),
    });
    ctl.dispatch(
      { type: "propose", proposal: phraseAgentCommand("echo ship", "/tmp"), force: true },
      5,
    );
    ctl.dispatch({ type: "pose", pose: "thumbs_up", dt: HOLD_MS }, 20);
    expect(decisions).toEqual(["approved"]);
    expect(ctl.publicState().mode).toBe("watching");
  });

  it("refuses on a held palm and on timeout", () => {
    const decisions: string[] = [];
    const ctl = new VideoController({
      onDecision: (_p, decision) => decisions.push(decision),
    });
    const destructive = phraseAgentCommand("rm -rf tmp", "/tmp");
    ctl.dispatch({ type: "propose", proposal: destructive, force: true }, 5);
    ctl.dispatch({ type: "pose", pose: "open_palm", dt: requiredHoldMs(destructive) }, 20);
    expect(decisions).toEqual(["rejected"]);
    expect(requiredHoldMs(destructive)).toBeGreaterThan(HOLD_MS);

    ctl.dispatch(
      { type: "propose", proposal: phraseAgentCommand("echo later", "/tmp"), force: true },
      40,
    );
    ctl.dispatch({ type: "timeout_approval" }, 50);
    expect(decisions).toEqual(["rejected", "rejected"]);
    expect(ctl.publicState().stamp).toMatch(/Timed out/);
  });

  it("does not approve from a twitch or a none pose", () => {
    let approved = 0;
    const ctl = new VideoController({
      onDecision: (_p, decision) => {
        if (decision === "approved") approved += 1;
      },
    });
    ctl.dispatch({ type: "propose", proposal: phraseProposal("bookmark"), force: true }, 1);
    ctl.dispatch({ type: "pose", pose: "thumbs_up", dt: 180 }, 2);
    ctl.dispatch({ type: "pose", pose: "none", dt: 20 }, 3);
    ctl.dispatch({ type: "pose", pose: "thumbs_up", dt: 400 }, 4);
    expect(approved).toBe(0);
  });
});
