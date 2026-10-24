import { shapeFromElement, type VideoShape } from "./find-video";
import type { VideoHandle } from "./video-controller";

export function bindHtmlVideo(
  el: HTMLVideoElement,
  extras: Partial<VideoShape> = {},
): VideoHandle {
  return {
    ...shapeFromElement(el, extras),
    play: () => el.play(),
    pause: () => el.pause(),
    get currentTime() {
      return el.currentTime;
    },
    set currentTime(value: number) {
      el.currentTime = value;
    },
    get paused() {
      return el.paused;
    },
    set paused(value: boolean) {
      if (value) el.pause();
      else void el.play();
    },
    get duration() {
      return Number.isFinite(el.duration) ? el.duration : 0;
    },
    get ended() {
      return el.ended;
    },
    get readyState() {
      return el.readyState;
    },
    get clientWidth() {
      return el.clientWidth;
    },
    get clientHeight() {
      return el.clientHeight;
    },
  };
}

export function pageVideoExtras(): Partial<VideoShape> {
  return {
    hostHint: typeof location !== "undefined" ? location.hostname : "",
    inIframe: typeof window !== "undefined" && window !== window.top,
  };
}
