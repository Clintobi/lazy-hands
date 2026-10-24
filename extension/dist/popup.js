"use strict";
(() => {
  // src/extension/popup.ts
  var startBtn = document.getElementById("start");
  var restBtn = document.getElementById("stop");
  var lamp = document.getElementById("lamp");
  startBtn?.addEventListener("click", () => {
    chrome.runtime.sendMessage({ type: "start-camera" });
    if (lamp) lamp.textContent = "Asking the camera";
  });
  restBtn?.addEventListener("click", () => {
    chrome.runtime.sendMessage({ type: "stop-camera" });
    if (lamp) lamp.textContent = "Lamp idle";
  });
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === "vision-status" && lamp) {
      const m = msg;
      lamp.textContent = m.seeingFace ? "Sees you" : m.seeingHand ? "Sees a hand" : m.status ?? "Looking";
    }
  });
})();
