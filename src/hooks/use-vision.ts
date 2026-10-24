"use client";

import { useEffect, useRef, useState } from "react";
import { classifyPose, detectSwipe, type PoseName } from "@/lib/gestures";
import type { HandFrame, Landmark } from "@/lib/landmarks";

export type VisionStatus = "idle" | "asking" | "live" | "denied" | "failed";

type HandCb = (pose: PoseName, swipe: "left" | "right" | null, latencyMs: number) => void;

export function useVision(enabled: boolean, onHand: HandCb, onFace: (visible: boolean) => void) {
  const [status, setStatus] = useState<VisionStatus>("idle");
  const [seeingHand, setSeeingHand] = useState(false);
  const [seeingFace, setSeeingFace] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const onHandRef = useRef(onHand);
  const onFaceRef = useRef(onFace);
  onHandRef.current = onHand;
  onFaceRef.current = onFace;

  useEffect(() => {
    if (!enabled) return;
    let stop = false;
    let stream: MediaStream | null = null;
    let hands: { detectForVideo: (v: HTMLVideoElement, t: number) => { landmarks?: Landmark[][] } } | null = null;
    let face: { detectForVideo: (v: HTMLVideoElement, t: number) => { detections?: unknown[] } } | null = null;
    const history: HandFrame[] = [];
    let raf = 0;

    async function start() {
      setStatus("asking");
      // Fail closed to a quiet lamp if the browser never answers.
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { width: 640, height: 480, facingMode: "user" },
          audio: false,
        });
      } catch {
        setStatus("denied");
        return;
      }
      if (stop) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      const video = videoRef.current;
      if (!video) {
        setStatus("failed");
        return;
      }
      video.srcObject = stream;
      await video.play().catch(() => undefined);

      try {
        const vision = await import("@mediapipe/tasks-vision");
        const fileset = await vision.FilesetResolver.forVisionTasks("/models/mediapipe/wasm");
        hands = await vision.HandLandmarker.createFromOptions(fileset, {
          baseOptions: { modelAssetPath: "/models/mediapipe/hand_landmarker.task" },
          runningMode: "VIDEO",
          numHands: 1,
        });
        face = await vision.FaceDetector.createFromOptions(fileset, {
          baseOptions: { modelAssetPath: "/models/mediapipe/blaze_face_short_range.tflite" },
          runningMode: "VIDEO",
        });
      } catch {
        setStatus("failed");
        return;
      }

      setStatus("live");
      let last = performance.now();
      const tick = () => {
        if (stop) return;
        const videoEl = videoRef.current;
        const now = performance.now();
        if (videoEl && videoEl.readyState >= 2 && now - last >= 66) {
          last = now;
          try {
            const handRes = hands?.detectForVideo(videoEl, now);
            const lm = handRes?.landmarks?.[0] as Landmark[] | undefined;
            if (lm && lm.length >= 21) {
              setSeeingHand(true);
              const pose = classifyPose(lm);
              history.push({ t: now, landmarks: lm });
              if (history.length > 16) history.shift();
              const swipe = detectSwipe(history);
              onHandRef.current(
                pose.pose,
                swipe.swipe === "swipe_left" ? "left" : swipe.swipe === "swipe_right" ? "right" : null,
                pose.latencyMs + swipe.latencyMs,
              );
            } else {
              setSeeingHand(false);
              onHandRef.current("none", null, 0);
            }
            const faceRes = face?.detectForVideo(videoEl, now);
            const visible = (faceRes?.detections?.length ?? 0) > 0;
            setSeeingFace(visible);
            onFaceRef.current(visible);
          } catch {
            // keep the loop alive
          }
        }
        raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    }

    void start();
    return () => {
      stop = true;
      cancelAnimationFrame(raf);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [enabled]);

  return { status, seeingHand, seeingFace, videoRef };
}
