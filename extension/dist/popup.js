"use strict";
(() => {
  // src/extension/popup.ts
  var start = document.getElementById("start");
  var stop = document.getElementById("stop");
  var lamp = document.getElementById("lamp");
  start?.addEventListener("click", () => {
    chrome.runtime.sendMessage({ type: "start-camera" });
    if (lamp) lamp.textContent = "Asking the camera";
  });
  stop?.addEventListener("click", () => {
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
