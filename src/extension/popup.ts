const startBtn = document.getElementById("start");
const restBtn = document.getElementById("stop");
const lamp = document.getElementById("lamp");

startBtn?.addEventListener("click", () => {
  chrome.runtime.sendMessage({ type: "start-camera" });
  if (lamp) lamp.textContent = "Asking the camera";
});
restBtn?.addEventListener("click", () => {
  chrome.runtime.sendMessage({ type: "stop-camera" });
  if (lamp) lamp.textContent = "Lamp idle";
});

chrome.runtime.onMessage.addListener((msg) => {
  if ((msg as { type?: string }).type === "vision-status" && lamp) {
    const m = msg as { seeingFace?: boolean; seeingHand?: boolean; status?: string };
    lamp.textContent = m.seeingFace ? "Sees you" : m.seeingHand ? "Sees a hand" : m.status ?? "Looking";
  }
});
