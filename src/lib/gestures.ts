import { dist, HAND, type HandFrame, type Landmark } from "./landmarks";

export type PoseName = "open_palm" | "thumbs_up" | "none";
export type SwipeName = "swipe_left" | "swipe_right";

export type PoseResult = {
  pose: PoseName;
  confidence: number;
  latencyMs: number;
};

export type SwipeResult = {
  swipe: SwipeName | null;
  confidence: number;
  latencyMs: number;
};

function fingerExtended(lm: Landmark[], tip: number, pip: number, mcp: number): boolean {
  const tipLen = dist(lm[tip], lm[mcp]);
  const fold = dist(lm[pip], lm[mcp]);
  return tipLen > fold * 1.45 && lm[tip].y < lm[mcp].y - 0.04;
}

function fingerCurled(lm: Landmark[], tip: number, mcp: number): boolean {
  return dist(lm[tip], lm[mcp]) < 0.14 && lm[tip].y > lm[mcp].y - 0.02;
}

function thumbUp(lm: Landmark[]): boolean {
  const tip = lm[HAND.THUMB_TIP];
  const ip = lm[HAND.THUMB_IP];
  const mcp = lm[HAND.THUMB_MCP];
  const wrist = lm[HAND.WRIST];
  const up = tip.y < ip.y - 0.03 && ip.y < mcp.y - 0.02 && tip.y < wrist.y - 0.12;
  const long = dist(tip, wrist) > dist(lm[HAND.INDEX_TIP], wrist) + 0.04;
  return up && long;
}

function thumbOut(lm: Landmark[]): boolean {
  const tip = lm[HAND.THUMB_TIP];
  const wrist = lm[HAND.WRIST];
  return Math.abs(tip.x - wrist.x) > 0.1 && tip.y < wrist.y + 0.02;
}

export function classifyPose(landmarks: Landmark[]): PoseResult {
  const started = nowMs();
  if (!landmarks || landmarks.length < 21) {
    return { pose: "none", confidence: 1, latencyMs: nowMs() - started };
  }

  const index = fingerExtended(landmarks, HAND.INDEX_TIP, HAND.INDEX_PIP, HAND.INDEX_MCP);
  const middle = fingerExtended(landmarks, HAND.MIDDLE_TIP, HAND.MIDDLE_PIP, HAND.MIDDLE_MCP);
  const ring = fingerExtended(landmarks, HAND.RING_TIP, HAND.RING_PIP, HAND.RING_MCP);
  const pinky = fingerExtended(landmarks, HAND.PINKY_TIP, HAND.PINKY_PIP, HAND.PINKY_MCP);
  const openCount = [index, middle, ring, pinky].filter(Boolean).length;

  const indexCurl = fingerCurled(landmarks, HAND.INDEX_TIP, HAND.INDEX_MCP);
  const middleCurl = fingerCurled(landmarks, HAND.MIDDLE_TIP, HAND.MIDDLE_MCP);
  const ringCurl = fingerCurled(landmarks, HAND.RING_TIP, HAND.RING_MCP);
  const pinkyCurl = fingerCurled(landmarks, HAND.PINKY_TIP, HAND.PINKY_MCP);
  const curlCount = [indexCurl, middleCurl, ringCurl, pinkyCurl].filter(Boolean).length;

  if (openCount >= 3 && thumbOut(landmarks)) {
    return {
      pose: "open_palm",
      confidence: 0.7 + 0.075 * openCount,
      latencyMs: nowMs() - started,
    };
  }

  if (thumbUp(landmarks) && curlCount >= 3 && openCount <= 1) {
    return {
      pose: "thumbs_up",
      confidence: 0.72 + 0.07 * curlCount,
      latencyMs: nowMs() - started,
    };
  }

  return { pose: "none", confidence: 0.55 + 0.1 * (4 - openCount), latencyMs: nowMs() - started };
}

export function detectSwipe(frames: HandFrame[], windowMs = 280): SwipeResult {
  const started = nowMs();
  if (frames.length < 4) {
    return { swipe: null, confidence: 0, latencyMs: nowMs() - started };
  }
  const last = frames[frames.length - 1];
  const recent = frames.filter((f) => last.t - f.t <= windowMs && last.t - f.t >= 0);
  if (recent.length < 4) {
    return { swipe: null, confidence: 0, latencyMs: nowMs() - started };
  }
  const xs = recent.map((f) => f.landmarks[HAND.WRIST]?.x ?? 0.5);
  const travel = xs[xs.length - 1] - xs[0];
  let consistent = 0;
  for (let i = 1; i < xs.length; i++) {
    const step = xs[i] - xs[i - 1];
    if (travel > 0 && step >= -0.01) consistent++;
    if (travel < 0 && step <= 0.01) consistent++;
  }
  const ratio = consistent / (xs.length - 1);
  if (Math.abs(travel) >= 0.18 && ratio >= 0.7) {
    return {
      swipe: travel < 0 ? "swipe_left" : "swipe_right",
      confidence: Math.min(0.98, 0.55 + Math.abs(travel)),
      latencyMs: nowMs() - started,
    };
  }
  return { swipe: null, confidence: ratio, latencyMs: nowMs() - started };
}

function nowMs(): number {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}
