import { collectDomCaptionLines, cuesFromTextTracks } from "../lib/page-captions";
import { buttonsFromDocument, pickConfirmCandidate } from "../lib/page-confirm";
import { phraseAgentCommand, phrasePageConfirm } from "../lib/proposals";
import { shapeFromElement } from "../lib/find-video";
import { VideoController, type VideoHandle } from "../lib/video-controller";
import { mountOverlay } from "./overlay-dom";
import type { ExtMessage } from "./messages";

const host = document.createElement("div");
host.id = "lazy-hands-root";
host.style.all = "initial";
document.documentElement.appendChild(host);
const overlay = mountOverlay(host);

let miss: string | null = null;
let hint = localStorage.getItem("lazy-hands-hint") !== "hid";
let lamp = "Lamp idle";
const scanned = new Set<string>();

const controller = new VideoController({
  onSummarise: (_from, _to, text) => {
    miss = text;
    paint();
  },
  onDecision: (proposal, decision) => {
    chrome.runtime.sendMessage({
      type: "answer",
      id: String(proposal.payload.askId ?? proposal.id),
      decision,
    } satisfies ExtMessage);
  },
  clickConfirm: (selector) => {
    if (!selector) return false;
    const el = document.querySelector(selector);
    if (!(el instanceof HTMLElement)) return false;
    el.click();
    return true;
  },
  onState: () => paint(),
});

function videos(): VideoHandle[] {
  const extras = {
    hostHint: location.hostname,
    inIframe: window !== window.top,
    display: "",
    visibility: "",
    opacity: 1,
  };
  return Array.from(document.querySelectorAll("video")).map((el) => {
    const style = window.getComputedStyle(el);
    return {
      ...shapeFromElement(el, {
        ...extras,
        display: style.display,
        visibility: style.visibility,
        opacity: Number(style.opacity),
      }),
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
    } as VideoHandle;
  });
}

function refreshVideo() {
  const chosen = controller.pickFrom(videos());
  if (!chosen) return;
  const el = document.querySelector("video");
  if (el) {
    controller.loadCaptions([
      { kind: "text_tracks", cues: cuesFromTextTracks(el.textTracks) },
      { kind: "youtube_dom", lines: collectDomCaptionLines(document.querySelectorAll(".ytp-caption-segment, .caption-window")) },
      { kind: "transcript", lines: collectDomCaptionLines(document.querySelectorAll("[data-purpose='transcript-cue'], .transcript-text")) },
    ]);
  }
}

function paint() {
  overlay.render({
    ...controller.publicState(),
    miss,
    hint,
    lamp,
  });
}

function scanDialogs() {
  if (controller.session.mode === "approval_pending") return;
  const nodes = document.querySelectorAll("button, [role='button'], input[type='button'], input[type='submit']");
  nodes.forEach((node, i) => node.setAttribute("data-lh-btn", String(i)));
  const candidate = pickConfirmCandidate(buttonsFromDocument(nodes));
  if (!candidate) return;
  const key = `${candidate.label}:${candidate.selector}`;
  if (scanned.has(key)) return;
  scanned.add(key);
  controller.dispatch({
    type: "propose",
    force: true,
    proposal: phrasePageConfirm(candidate.label, candidate.selector, candidate.destructive),
  });
}

chrome.runtime.onMessage.addListener((raw) => {
  const msg = raw as ExtMessage;
  if (msg.type === "pose") controller.dispatch({ type: "pose", pose: msg.pose, dt: msg.dt });
  if (msg.type === "swipe") controller.dispatch({ type: "swipe", dir: msg.dir });
  if (msg.type === "face") {
    controller.dispatch({
      type: "face",
      visible: msg.visible,
      dt: msg.dt,
      videoTime: controller.video?.currentTime ?? 0,
    });
  }
  if (msg.type === "vision-status") {
    lamp = msg.seeingFace ? "Sees you" : msg.seeingHand ? "Sees a hand" : msg.status;
    paint();
  }
  if (msg.type === "ask") {
    controller.dispatch({
      type: "propose",
      force: true,
      proposal: {
        ...phraseAgentCommand(msg.ask.command, msg.ask.cwd),
        payload: { command: msg.ask.command, cwd: msg.ask.cwd, askId: msg.ask.id },
      },
    });
  }
  return false;
});

window.addEventListener("keydown", (event) => {
  if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
  if (event.code === "Space" && controller.session.mode === "watching") {
    event.preventDefault();
    controller.dispatch({ type: "pose", pose: "open_palm", dt: 200 });
  }
  if (event.key === "m" || event.key === "M") {
    controller.dispatch({ type: "miss_key", videoTime: controller.video?.currentTime ?? 0 });
  }
  if (event.key === "ArrowLeft") controller.dispatch({ type: "swipe", dir: "left" });
  if (event.key === "ArrowRight") controller.dispatch({ type: "swipe", dir: "right" });
  if (event.key === "Escape") {
    hint = false;
    localStorage.setItem("lazy-hands-hint", "hid");
    paint();
  }
});

refreshVideo();
setInterval(() => {
  refreshVideo();
  controller.considerProposal();
  scanDialogs();
}, 1500);

new MutationObserver(() => {
  if (document.querySelector("dialog, [role='dialog'], [role='alertdialog']")) scanDialogs();
}).observe(document.documentElement, { childList: true, subtree: true });

paint();
