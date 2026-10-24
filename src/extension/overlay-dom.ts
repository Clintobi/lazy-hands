import { holdHint, onceHint } from "../lib/overlay-copy";
import type { PublicController } from "../lib/video-controller";

export function mountOverlay(host: HTMLElement) {
  const root = host.attachShadow({ mode: "open" });
  const wrap = document.createElement("div");
  wrap.setAttribute("data-lh-root", "1");
  root.appendChild(wrap);
  const style = document.createElement("style");
  style.textContent = overlayCss();
  root.appendChild(style);
  return {
    render(state: PublicController & { miss?: string | null; hint?: boolean; lamp?: string }) {
      wrap.innerHTML = `
        <div class="lh-layer">
          ${state.hint ? `<aside class="lh-hint"><p class="lh-kicker">Once</p><p>${escapeHtml(onceHint())}</p></aside>` : ""}
          ${state.stamp ? `<div class="lh-stamp">${escapeHtml(state.stamp)}</div>` : ""}
          ${
            state.proposal
              ? `<article class="lh-card">
                  <p class="lh-kicker">${state.proposal.destructive ? "Hold to confirm" : "The model asks"}</p>
                  <h2>${escapeHtml(state.proposal.title)}</h2>
                  <p>${escapeHtml(state.proposal.detail)}</p>
                  <p class="lh-fine">${escapeHtml(holdHint(state.proposal))}</p>
                  <div class="lh-ring" style="--p:${state.holdProgress}">${state.holdIntent === "approve" ? "Yes" : state.holdIntent === "reject" ? "No" : "Hold"}</div>
                </article>`
              : ""
          }
          ${state.miss ? `<article class="lh-miss"><p class="lh-kicker">You missed a stretch</p><p>${escapeHtml(state.miss)}</p></article>` : ""}
          <span class="lh-lamp">${escapeHtml(state.lamp ?? "Lamp")}</span>
        </div>
      `;
    },
    unmount() {
      host.remove();
    },
  };
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function overlayCss() {
  return `
    :host { all: initial; }
    .lh-layer {
      position: fixed; inset: 0; pointer-events: none; z-index: 2147483646;
      font-family: "Iowan Old Style", Palatino, "Palatino Linotype", Georgia, serif;
      color: #3b2a1c;
    }
    .lh-hint, .lh-card, .lh-miss {
      pointer-events: auto;
      background: #fbf3e4;
      color: #3b2a1c;
      box-shadow: 6px 6px 0 rgba(106, 64, 36, 0.28);
    }
    .lh-hint {
      position: absolute; left: 16px; top: 16px; max-width: 22rem;
      border-left: 5px solid #b07d32; padding: 0.75rem 0.9rem;
    }
    .lh-card, .lh-miss {
      position: absolute; left: 20px; right: 20px; bottom: 20px;
      padding: 0.9rem 1rem 1rem;
    }
    .lh-card { border-top: 5px solid #b07d32; }
    .lh-miss { border-left: 5px solid #b64a28; }
    .lh-kicker { text-transform: uppercase; letter-spacing: 0.16em; font-size: 11px; margin: 0 0 0.35rem; color: #6a4024; }
    h2 { font-style: italic; font-size: 1.35rem; margin: 0 0 0.3rem; }
    p { margin: 0 0 0.35rem; line-height: 1.4; }
    .lh-fine { font-size: 12px; color: #6a4024; }
    .lh-stamp {
      position: absolute; left: 8%; top: 18%;
      border: 3px solid #b64a28; color: #b64a28;
      font-style: italic; font-size: 2rem; padding: 0.1em 0.4em;
      background: rgba(251,243,228,0.8); transform: rotate(-7deg);
    }
    .lh-ring {
      position: absolute; right: 16px; top: 16px;
      width: 64px; height: 64px; border-radius: 50%;
      display: grid; place-items: center;
      background: conic-gradient(#4d5a33 calc(var(--p) * 360deg), #e7d3b4 0);
      font-size: 11px; text-transform: uppercase; letter-spacing: 0.12em;
    }
    .lh-lamp {
      position: absolute; right: 16px; top: 16px;
      background: #fbf3e4; padding: 0.25rem 0.5rem; font-size: 11px;
      text-transform: uppercase; letter-spacing: 0.14em;
    }
  `;
}
