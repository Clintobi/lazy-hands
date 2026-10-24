import { describe, expect, it } from "vitest";
import { pickMainVideo, scoreVideo, type VideoShape } from "@/lib/find-video";

function vid(partial: Partial<VideoShape> & Pick<VideoShape, "clientWidth" | "clientHeight">): VideoShape {
  return {
    duration: 120,
    currentTime: 8,
    paused: true,
    ended: false,
    readyState: 4,
    src: "clip.mp4",
    ...partial,
  };
}

describe("pickMainVideo", () => {
  it("picks the only visible player", () => {
    const main = vid({ id: "hero", clientWidth: 960, clientHeight: 540 });
    expect(pickMainVideo([main])?.id).toBe("hero");
  });

  it("ignores tiny preview tiles next to a YouTube-shaped player", () => {
    const preview = vid({
      className: "ytp-preview",
      clientWidth: 160,
      clientHeight: 90,
      duration: 8,
      hostHint: "youtube.com",
    });
    const player = vid({
      className: "html5-main-video video-stream",
      clientWidth: 1280,
      clientHeight: 720,
      paused: false,
      duration: 840,
      hostHint: "youtube.com",
    });
    expect(pickMainVideo([preview, player])?.className).toContain("html5-main-video");
  });

  it("prefers a Netflix-sized playing video over a muted bumper", () => {
    const bumper = vid({
      className: "ad-bumper",
      clientWidth: 300,
      clientHeight: 250,
      duration: 6,
      hostHint: "netflix.com",
    });
    const feature = vid({
      className: "watch-video--player-view",
      clientWidth: 1920,
      clientHeight: 800,
      paused: false,
      duration: 5400,
      hostHint: "netflix.com",
    });
    expect(pickMainVideo([bumper, feature])?.className).toContain("watch-video");
  });

  it("can lock onto a mid-size X clip when it is the only real video", () => {
    const clip = vid({
      clientWidth: 500,
      clientHeight: 280,
      duration: 44,
      paused: false,
      hostHint: "x.com",
    });
    expect(pickMainVideo([clip])).not.toBeNull();
    expect(scoreVideo(clip)).toBeGreaterThan(0);
  });

  it("skips hidden, ended, and display-none nodes", () => {
    const hidden = vid({ clientWidth: 900, clientHeight: 500, hidden: true });
    const none = vid({ clientWidth: 900, clientHeight: 500, display: "none" });
    const ended = vid({ clientWidth: 900, clientHeight: 500, ended: true, paused: true });
    const live = vid({ id: "live", clientWidth: 640, clientHeight: 360 });
    expect(pickMainVideo([hidden, none, ended, live])?.id).toBe("live");
  });

  it("still prefers a same-page player over a smaller iframe embed", () => {
    const iframe = vid({
      id: "vimeo-embed",
      clientWidth: 480,
      clientHeight: 270,
      inIframe: true,
      hostHint: "vimeo.com",
    });
    const page = vid({ id: "page-player", clientWidth: 800, clientHeight: 450 });
    expect(pickMainVideo([iframe, page])?.id).toBe("page-player");
  });
});
