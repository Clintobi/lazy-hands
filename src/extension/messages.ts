import type { PoseName } from "../lib/gestures";
import type { Proposal } from "../lib/proposals";
import type { BridgeAsk } from "../lib/bridge-protocol";

export type ExtMessage =
  | { type: "pose"; pose: PoseName; dt: number }
  | { type: "swipe"; dir: "left" | "right" }
  | { type: "face"; visible: boolean; dt: number }
  | { type: "vision-status"; status: string; seeingHand: boolean; seeingFace: boolean }
  | { type: "ask"; ask: BridgeAsk }
  | { type: "answer"; id: string; decision: "approved" | "rejected" | "timeout"; holdMs?: number }
  | { type: "start-camera" }
  | { type: "stop-camera" }
  | { type: "get-state" }
  | { type: "state"; proposal: Proposal | null; stamp: string | null; mode: string };
