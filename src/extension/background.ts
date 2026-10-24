import { BRIDGE_PORT, parseBridgeMessage, wsUrl, type BridgeAsk } from "../lib/bridge-protocol";
import type { ExtMessage } from "./messages";

async function ensureOffscreen() {
  try {
    await chrome.offscreen.createDocument({
      url: "offscreen.html",
      reasons: ["USER_MEDIA"],
      justification: "Local hand and face tracking never leaves this machine.",
    });
  } catch {
    // already open
  }
}

async function activeTabId() {
  const tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  return tabs[0]?.id;
}

async function relay(msg: ExtMessage) {
  const id = await activeTabId();
  if (id == null) return;
  try {
    await chrome.tabs.sendMessage(id, msg);
  } catch {
    // tab has no content script
  }
}

function connectBridge() {
  let socket: WebSocket | null = null;
  const tick = () => {
    if (socket && socket.readyState <= 1) return;
    try {
      socket = new WebSocket(wsUrl(BRIDGE_PORT));
    } catch {
      return;
    }
    socket.addEventListener("open", () => {
      socket?.send(JSON.stringify({ type: "hello", role: "extension" }));
    });
    socket.addEventListener("message", (event) => {
      const message = parseBridgeMessage(String(event.data));
      if (message?.type === "ask") void relay({ type: "ask", ask: message });
      if (message?.type === "status" && message.pending) {
        void relay({ type: "ask", ask: message.pending as BridgeAsk });
      }
    });
    socket.addEventListener("close", () => {
      socket = null;
    });
  };
  setInterval(tick, 2500);
  tick();
  chrome.runtime.onMessage.addListener((raw) => {
    const msg = raw as ExtMessage;
    if (msg.type === "answer" && socket?.readyState === 1) {
      socket.send(
        JSON.stringify({
          type: "answer",
          id: msg.id,
          decision: msg.decision,
          holdMs: msg.holdMs,
        }),
      );
    }
    if (msg.type === "pose" || msg.type === "swipe" || msg.type === "face" || msg.type === "vision-status") {
      void relay(msg);
    }
    if (msg.type === "start-camera") void ensureOffscreen();
    return false;
  });
}

void ensureOffscreen();
connectBridge();
