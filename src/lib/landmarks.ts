export type Landmark = { x: number; y: number; z: number };

export type HandFrame = {
  t: number;
  landmarks: Landmark[];
};

export const HAND = {
  WRIST: 0,
  THUMB_CMC: 1,
  THUMB_MCP: 2,
  THUMB_IP: 3,
  THUMB_TIP: 4,
  INDEX_MCP: 5,
  INDEX_PIP: 6,
  INDEX_DIP: 7,
  INDEX_TIP: 8,
  MIDDLE_MCP: 9,
  MIDDLE_PIP: 10,
  MIDDLE_DIP: 11,
  MIDDLE_TIP: 12,
  RING_MCP: 13,
  RING_PIP: 14,
  RING_DIP: 15,
  RING_TIP: 16,
  PINKY_MCP: 17,
  PINKY_PIP: 18,
  PINKY_DIP: 19,
  PINKY_TIP: 20,
} as const;

export function dist(a: Landmark, b: Landmark): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const dz = a.z - b.z;
  return Math.hypot(dx, dy, dz);
}

function pt(x: number, y: number, z = 0): Landmark {
  return { x, y, z };
}

function emptyHand(): Landmark[] {
  return Array.from({ length: 21 }, () => pt(0.5, 0.6, 0));
}

/**
 * Build a 21-point right hand in image space (y grows downward).
 * Poses are geometrically exaggerated so unit tests stay honest.
 */
export function makeHand(
  pose: "open_palm" | "thumbs_up" | "fist" | "point" | "none",
  opts: { wristX?: number; wristY?: number; t?: number } = {},
): HandFrame {
  const wx = opts.wristX ?? 0.5;
  const wy = opts.wristY ?? 0.62;
  const t = opts.t ?? 0;
  const lm = emptyHand();
  lm[HAND.WRIST] = pt(wx, wy, 0);

  if (pose === "none") {
    return { t, landmarks: lm };
  }

  const finger = (
    mcp: number,
    pip: number,
    dip: number,
    tip: number,
    spread: number,
    extended: boolean,
  ) => {
    const baseX = wx + spread;
    const baseY = wy - 0.06;
    lm[mcp] = pt(baseX, baseY, 0);
    if (extended) {
      lm[pip] = pt(baseX + spread * 0.15, baseY - 0.1, 0);
      lm[dip] = pt(baseX + spread * 0.2, baseY - 0.17, 0);
      lm[tip] = pt(baseX + spread * 0.22, baseY - 0.26, 0);
    } else {
      lm[pip] = pt(baseX + 0.01, baseY + 0.03, 0.01);
      lm[dip] = pt(baseX + 0.015, baseY + 0.055, 0.02);
      lm[tip] = pt(baseX + 0.02, wy - 0.01, 0.03);
    }
  };

  if (pose === "open_palm") {
    lm[HAND.THUMB_CMC] = pt(wx - 0.04, wy - 0.02, 0);
    lm[HAND.THUMB_MCP] = pt(wx - 0.09, wy - 0.05, 0);
    lm[HAND.THUMB_IP] = pt(wx - 0.13, wy - 0.08, 0);
    lm[HAND.THUMB_TIP] = pt(wx - 0.18, wy - 0.1, 0);
    finger(HAND.INDEX_MCP, HAND.INDEX_PIP, HAND.INDEX_DIP, HAND.INDEX_TIP, -0.05, true);
    finger(HAND.MIDDLE_MCP, HAND.MIDDLE_PIP, HAND.MIDDLE_DIP, HAND.MIDDLE_TIP, 0, true);
    finger(HAND.RING_MCP, HAND.RING_PIP, HAND.RING_DIP, HAND.RING_TIP, 0.05, true);
    finger(HAND.PINKY_MCP, HAND.PINKY_PIP, HAND.PINKY_DIP, HAND.PINKY_TIP, 0.1, true);
  } else if (pose === "thumbs_up") {
    lm[HAND.THUMB_CMC] = pt(wx - 0.02, wy - 0.04, 0);
    lm[HAND.THUMB_MCP] = pt(wx - 0.02, wy - 0.12, 0);
    lm[HAND.THUMB_IP] = pt(wx - 0.02, wy - 0.2, 0);
    lm[HAND.THUMB_TIP] = pt(wx - 0.02, wy - 0.3, 0);
    finger(HAND.INDEX_MCP, HAND.INDEX_PIP, HAND.INDEX_DIP, HAND.INDEX_TIP, -0.04, false);
    finger(HAND.MIDDLE_MCP, HAND.MIDDLE_PIP, HAND.MIDDLE_DIP, HAND.MIDDLE_TIP, 0, false);
    finger(HAND.RING_MCP, HAND.RING_PIP, HAND.RING_DIP, HAND.RING_TIP, 0.04, false);
    finger(HAND.PINKY_MCP, HAND.PINKY_PIP, HAND.PINKY_DIP, HAND.PINKY_TIP, 0.08, false);
  } else if (pose === "fist") {
    lm[HAND.THUMB_CMC] = pt(wx - 0.03, wy - 0.01, 0);
    lm[HAND.THUMB_MCP] = pt(wx - 0.05, wy + 0.01, 0);
    lm[HAND.THUMB_IP] = pt(wx - 0.04, wy + 0.03, 0);
    lm[HAND.THUMB_TIP] = pt(wx - 0.01, wy + 0.02, 0);
    finger(HAND.INDEX_MCP, HAND.INDEX_PIP, HAND.INDEX_DIP, HAND.INDEX_TIP, -0.04, false);
    finger(HAND.MIDDLE_MCP, HAND.MIDDLE_PIP, HAND.MIDDLE_DIP, HAND.MIDDLE_TIP, 0, false);
    finger(HAND.RING_MCP, HAND.RING_PIP, HAND.RING_DIP, HAND.RING_TIP, 0.04, false);
    finger(HAND.PINKY_MCP, HAND.PINKY_PIP, HAND.PINKY_DIP, HAND.PINKY_TIP, 0.08, false);
  } else if (pose === "point") {
    lm[HAND.THUMB_CMC] = pt(wx - 0.03, wy - 0.02, 0);
    lm[HAND.THUMB_MCP] = pt(wx - 0.06, wy - 0.01, 0);
    lm[HAND.THUMB_IP] = pt(wx - 0.08, wy + 0.01, 0);
    lm[HAND.THUMB_TIP] = pt(wx - 0.05, wy + 0.03, 0);
    finger(HAND.INDEX_MCP, HAND.INDEX_PIP, HAND.INDEX_DIP, HAND.INDEX_TIP, -0.04, true);
    finger(HAND.MIDDLE_MCP, HAND.MIDDLE_PIP, HAND.MIDDLE_DIP, HAND.MIDDLE_TIP, 0, false);
    finger(HAND.RING_MCP, HAND.RING_PIP, HAND.RING_DIP, HAND.RING_TIP, 0.04, false);
    finger(HAND.PINKY_MCP, HAND.PINKY_PIP, HAND.PINKY_DIP, HAND.PINKY_TIP, 0.08, false);
  }

  return { t, landmarks: lm };
}

export function swipeFrames(
  dir: "left" | "right",
  startT = 0,
  count = 8,
  dt = 30,
): HandFrame[] {
  const from = dir === "left" ? 0.72 : 0.28;
  const to = dir === "left" ? 0.28 : 0.72;
  return Array.from({ length: count }, (_, i) => {
    const u = i / (count - 1);
    const x = from + (to - from) * u;
    return makeHand("open_palm", { wristX: x, wristY: 0.55, t: startT + i * dt });
  });
}
