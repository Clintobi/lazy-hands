import { classifyPose, detectSwipe } from "../lib/gestures";
import type { HandFrame, Landmark } from "../lib/landmarks";

let stream: MediaStream | null = null;
let running = false;

async function start() {
  if (running) return;
  running = true;
  const video = document.querySelector("video");
  if (!video) return;
  stream = await navigator.mediaDevices.getUserMedia({
    video: { width: 640, height: 480, facingMode: "user" },
    audio: false,
  });
  video.srcObject = stream;
  await video.play();

  const vision = await import("@mediapipe/tasks-vision");
  const wasm = chrome.runtime.getURL("models/mediapipe/wasm");
  const fileset = await vision.FilesetResolver.forVisionTasks(wasm);
  const hands = await vision.HandLandmarker.createFromOptions(fileset, {
    baseOptions: { modelAssetPath: chrome.runtime.getURL("models/mediapipe/hand_landmarker.task") },
    runningMode: "VIDEO",
    numHands: 1,
  });
  const face = await vision.FaceDetector.createFromOptions(fileset, {
    baseOptions: { modelAssetPath: chrome.runtime.getURL("models/mediapipe/blaze_face_short_range.tflite") },
    runningMode: "VIDEO",
  });

  const history: HandFrame[] = [];
  let last = 0;
  const tick = () => {
    if (!running) return;
    const now = performance.now();
    if (video.readyState >= 2 && now - last >= 66) {
      last = now;
      const handRes = hands.detectForVideo(video, now);
      const lm = handRes.landmarks?.[0] as Landmark[] | undefined;
      if (lm && lm.length >= 21) {
        const pose = classifyPose(lm);
        history.push({ t: now, landmarks: lm });
        if (history.length > 16) history.shift();
        const swipe = detectSwipe(history);
        chrome.runtime.sendMessage({ type: "pose", pose: pose.pose, dt: 70 });
        if (swipe.swipe === "swipe_left") chrome.runtime.sendMessage({ type: "swipe", dir: "left" });
        if (swipe.swipe === "swipe_right") chrome.runtime.sendMessage({ type: "swipe", dir: "right" });
        chrome.runtime.sendMessage({ type: "vision-status", status: "live", seeingHand: true, seeingFace: false });
      } else {
        chrome.runtime.sendMessage({ type: "pose", pose: "none", dt: 70 });
      }
      const faces = face.detectForVideo(video, now);
      const visible = (faces.detections?.length ?? 0) > 0;
      chrome.runtime.sendMessage({ type: "face", visible, dt: 70 });
      chrome.runtime.sendMessage({
        type: "vision-status",
        status: "live",
        seeingHand: Boolean(lm),
        seeingFace: visible,
      });
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

chrome.runtime.onMessage.addListener((msg) => {
  if ((msg as { type?: string }).type === "start-camera") void start();
  if ((msg as { type?: string }).type === "stop-camera") {
    running = false;
    stream?.getTracks().forEach((t) => t.stop());
  }
});

void start();
