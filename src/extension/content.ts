import { bindHtmlVideo, pageVideoExtras } from "../lib/bind-video";
import { collectDomCaptionLines, cuesFromTextTracks } from "../lib/page-captions";
import { buttonsFromDocument, pickConfirmCandidate } from "../lib/page-confirm";
import { phraseAgentCommand, phrasePageConfirm } from "../lib/proposals";
import { VideoController, type VideoHandle } from "../lib/video-controller";
import { mountOverlay } from "./overlay-dom";
import type { ExtMessage } from "./messages";

const isTop = window === window.top;
const host = document.createElement("div");
host.id = "lazy-hands-root";
host.style.all = "initial";

let overlay: ReturnType<typeof mountOverlay> | null = null;
let miss: string | null = null;
let hint = localStorage.getItem("lazy-hands-hint") !== "hid";
let lamp = "";
const scanned = new Set<string>();
const held = { yes: false, no: false };

const controller = new VideoController({
  onSummarise: (_from, _to, text) => {
    miss = text;
    paint();
  },
  onDecision: (proposal, decision) => {
    if (!isTop) return;
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

function extras() {
  const base = pageVideoExtras();
  return {
    ...base,
    display: "",
    visibility: "",
    opacity: 1,
  };
}

function listVideos(): { handle: VideoHandle; el: HTMLVideoElement }[] {
  return Array.from(document.querySelectorAll("video")).map((el) => {
    const style = window.getComputedStyle(el);
    return {
      handle: bindHtmlVideo(el, {
        ...extras(),
        display: style.display,
        visibility: style.visibility,
        opacity: Number(style.opacity),
      }),
      el,
    };
  });
}

function harvestFrom(el: HTMLVideoElement) {
  controller.loadCaptions([
    { kind: "text_tracks", cues: cuesFromTextTracks(el.textTracks) },
    {
      kind: "youtube_dom",
      lines: collectDomCaptionLines(document.querySelectorAll(".ytp-caption-segment, .caption-window")),
    },
    {
      kind: "transcript",
      lines: collectDomCaptionLines(
        document.querySelectorAll("[data-purpose='transcript-cue'], .transcript-text, ytd-transcript-segment-renderer"),
      ),
    },
  ]);
}

function refreshVideo() {
  const list = listVideos();
  const chosen = controller.pickFrom(list.map((row) => row.handle));
  const match = list.find((row) => row.handle === chosen);
  if (match) harvestFrom(match.el);
  maybeMount();
}

function maybeMount() {
  if (overlay) return;
  if (!isTop && !controller.video) return;
  if (!host.isConnected) document.documentElement.appendChild(host);
  overlay = mountOverlay(host, {
    onDismissHint: () => {
      hint = false;
      try {
        localStorage.setItem("lazy-hands-hint", "hid");
      } catch {
        // private mode
      }
      paint();
    },
  });
}

function paint() {
  if (!overlay) return;
  const pub = controller.publicState();
  const hasWork = Boolean(controller.video || pub.proposal || miss || pub.stamp);
  overlay.render({
    ...pub,
    miss,
    hint: hint && Boolean(controller.video),
    lamp: hasWork ? lamp : "",
  });
}

function uniqueButtons(nodes: Element[]) {
  return Array.from(new Set(nodes));
}

function scanDialogs() {
  if (!isTop) return;
  if (controller.session.mode === "approval_pending") return;
  const nodes: Element[] = [];
  document.querySelectorAll("dialog, [role='dialog'], [role='alertdialog']").forEach((dialog) => {
    if (dialog instanceof HTMLDialogElement && !dialog.open) return;
    dialog.querySelectorAll("button, [role='button'], input[type='button'], input[type='submit']").forEach((node) => {
      nodes.push(node);
    });
  });
  document.querySelectorAll("button, [role='button']").forEach((node) => {
    const label = (node.textContent ?? "").replace(/\s+/g, " ").trim();
    if (/^(approve|confirm|allow|execute|proceed)$/i.test(label)) nodes.push(node);
  });
  const unique = uniqueButtons(nodes);
  unique.forEach((node, i) => node.setAttribute("data-lh-btn", String(i)));
  const candidate = pickConfirmCandidate(buttonsFromDocument(unique));
  if (!candidate) return;
  const key = `${location.href}:${candidate.label}:${candidate.selector}`;
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
    if (!isTop) return false;
    maybeMount();
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
  if (event.code === "Space" && controller.session.mode === "watching" && controller.video) {
    event.preventDefault();
    controller.dispatch({ type: "pose", pose: "open_palm", dt: 200 });
  }
  if (event.key === "m" || event.key === "M") {
    controller.dispatch({ type: "miss_key", videoTime: controller.video?.currentTime ?? 0 });
  }
  if (event.key === "ArrowLeft") controller.dispatch({ type: "swipe", dir: "left" });
  if (event.key === "ArrowRight") controller.dispatch({ type: "swipe", dir: "right" });
  if (event.key === "y" || event.key === "Y") held.yes = true;
  if (event.key === "n" || event.key === "N") held.no = true;
  if (event.key === "Escape") {
    hint = false;
    try {
      localStorage.setItem("lazy-hands-hint", "hid");
    } catch {
      // private mode
    }
    paint();
  }
});

window.addEventListener("keyup", (event) => {
  if (event.key === "y" || event.key === "Y") held.yes = false;
  if (event.key === "n" || event.key === "N") held.no = false;
});

window.setInterval(() => {
  if (held.yes) controller.dispatch({ type: "pose", pose: "thumbs_up", dt: 50 });
  if (held.no) controller.dispatch({ type: "pose", pose: "open_palm", dt: 50 });
}, 50);

refreshVideo();
setInterval(() => {
  refreshVideo();
  if (controller.video) controller.considerProposal();
  scanDialogs();
}, 1500);

new MutationObserver(() => {
  if (isTop && document.querySelector("dialog, [role='dialog'], [role='alertdialog']")) scanDialogs();
  if (!controller.video) refreshVideo();
}).observe(document.documentElement, { childList: true, subtree: true });

maybeMount();
paint();
