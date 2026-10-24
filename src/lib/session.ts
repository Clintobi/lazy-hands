import type { Proposal } from "./proposals";

export const PALM_PULSE_MS = 180;
export const HOLD_MS = 800;
export const GESTURE_COOLDOWN_MS = 900;
export const AWAY_ARM_MS = 900;
export const MIN_MISS_S = 4;
export const SKIP_S = 10;

export type Mode = "watching" | "approval_pending";
export type Playback = "paused" | "playing";
export type Attention = "present" | "away";
export type HoldIntent = "approve" | "reject";

export type ApprovalLogEntry = {
  at: number;
  proposalId: string;
  kind: Proposal["kind"];
  title: string;
  decision: "approved" | "rejected";
  gesture: HoldIntent;
  holdMs: number;
};

export type SessionState = {
  mode: Mode;
  playback: Playback;
  attention: Attention;
  approval: null | {
    proposal: Proposal;
    hold: null | { intent: HoldIntent; ms: number };
  };
  palmMs: number;
  palmFired: boolean;
  awayHiddenMs: number;
  awayFromVideoTime: number | null;
  cooldownUntil: number;
  lastStamp: null | { label: string; at: number };
  log: ApprovalLogEntry[];
};

export type SessionEvent =
  | { type: "pose"; pose: "open_palm" | "thumbs_up" | "none"; dt: number }
  | { type: "swipe"; dir: "left" | "right" }
  | { type: "propose"; proposal: Proposal }
  | { type: "face"; visible: boolean; dt: number; videoTime: number }
  | { type: "miss_key"; videoTime: number }
  | { type: "play" }
  | { type: "pause" }
  | { type: "clear_stamp" };

export type SessionEffect =
  | { type: "toggle_playback" }
  | { type: "set_playback"; playing: boolean }
  | { type: "seek"; seconds: number }
  | { type: "stamp"; label: string }
  | { type: "summarise"; from: number; to: number }
  | { type: "apply_proposal"; proposal: Proposal }
  | { type: "log"; entry: ApprovalLogEntry };

export function initialSession(now = 0): SessionState {
  return {
    mode: "watching",
    playback: "paused",
    attention: "present",
    approval: null,
    palmMs: 0,
    palmFired: false,
    awayHiddenMs: 0,
    awayFromVideoTime: null,
    cooldownUntil: now,
    lastStamp: null,
    log: [],
  };
}

export function holdProgress(state: SessionState): number {
  if (state.mode !== "approval_pending" || !state.approval?.hold) return 0;
  return Math.min(1, state.approval.hold.ms / HOLD_MS);
}

export function reduceSession(
  state: SessionState,
  event: SessionEvent,
  now: number,
  videoTime = 0,
): { state: SessionState; effects: SessionEffect[] } {
  const next: SessionState = {
    ...state,
    approval: state.approval
      ? { ...state.approval, hold: state.approval.hold ? { ...state.approval.hold } : null }
      : null,
    lastStamp: state.lastStamp ? { ...state.lastStamp } : null,
    log: state.log.slice(),
  };
  const effects: SessionEffect[] = [];

  const stamp = (label: string) => {
    next.lastStamp = { label, at: now };
    effects.push({ type: "stamp", label });
  };

  const cooling = now < next.cooldownUntil;
  const armCooldown = () => {
    next.cooldownUntil = now + GESTURE_COOLDOWN_MS;
  };

  switch (event.type) {
    case "play":
      next.playback = "playing";
      effects.push({ type: "set_playback", playing: true });
      break;
    case "pause":
      next.playback = "paused";
      effects.push({ type: "set_playback", playing: false });
      break;
    case "clear_stamp":
      next.lastStamp = null;
      break;
    case "swipe": {
      const seconds = event.dir === "left" ? -SKIP_S : SKIP_S;
      effects.push({ type: "seek", seconds });
      stamp(event.dir === "left" ? "Back 10s" : "Ahead 10s");
      armCooldown();
      break;
    }
    case "propose": {
      if (next.mode === "approval_pending") break;
      if (next.attention === "away") break;
      next.mode = "approval_pending";
      next.approval = { proposal: event.proposal, hold: null };
      next.palmMs = 0;
      next.palmFired = false;
      break;
    }
    case "miss_key": {
      if (next.attention === "present") {
        next.attention = "away";
        next.awayFromVideoTime = event.videoTime;
        next.awayHiddenMs = AWAY_ARM_MS;
        stamp("Away");
      } else {
        const from = next.awayFromVideoTime ?? event.videoTime;
        const span = event.videoTime - from;
        next.attention = "present";
        next.awayFromVideoTime = null;
        next.awayHiddenMs = 0;
        if (span >= MIN_MISS_S) {
          effects.push({ type: "summarise", from, to: event.videoTime });
        }
        stamp("Back");
      }
      break;
    }
    case "face": {
      if (event.visible) {
        if (next.attention === "away" && next.awayFromVideoTime != null) {
          const from = next.awayFromVideoTime;
          const span = event.videoTime - from;
          next.attention = "present";
          next.awayFromVideoTime = null;
          next.awayHiddenMs = 0;
          if (span >= MIN_MISS_S) {
            effects.push({ type: "summarise", from, to: event.videoTime });
          }
          stamp("Back");
        } else {
          next.awayHiddenMs = 0;
        }
      } else if (next.attention === "present" && next.mode === "watching") {
        next.awayHiddenMs += event.dt;
        if (next.awayHiddenMs >= AWAY_ARM_MS) {
          next.attention = "away";
          next.awayFromVideoTime = event.videoTime;
          stamp("Away");
        }
      }
      break;
    }
    case "pose": {
      if (next.mode === "watching") {
        next.approval = null;
        if (event.pose === "open_palm") {
          next.palmMs += event.dt;
          if (!next.palmFired && !cooling && next.palmMs >= PALM_PULSE_MS) {
            next.palmFired = true;
            next.playback = next.playback === "playing" ? "paused" : "playing";
            effects.push({ type: "toggle_playback" });
            stamp(next.playback === "paused" ? "Pause" : "Play");
            armCooldown();
          }
        } else {
          next.palmMs = 0;
          next.palmFired = false;
        }
        break;
      }

      // Approval pending: palm is reject, thumb is approve. Neither pauses.
      next.palmMs = 0;
      next.palmFired = false;
      if (!next.approval) break;

      const intent: HoldIntent | null =
        event.pose === "thumbs_up" ? "approve" : event.pose === "open_palm" ? "reject" : null;

      if (!intent) {
        next.approval.hold = null;
        break;
      }

      if (!next.approval.hold || next.approval.hold.intent !== intent) {
        next.approval.hold = { intent, ms: event.dt };
      } else {
        next.approval.hold.ms += event.dt;
      }

      if (next.approval.hold.ms >= HOLD_MS && !cooling) {
        const proposal = next.approval.proposal;
        const holdMs = next.approval.hold.ms;
        const entry: ApprovalLogEntry = {
          at: now,
          proposalId: proposal.id,
          kind: proposal.kind,
          title: proposal.title,
          decision: intent === "approve" ? "approved" : "rejected",
          gesture: intent,
          holdMs,
        };
        next.log.unshift(entry);
        effects.push({ type: "log", entry });
        if (intent === "approve") {
          effects.push({ type: "apply_proposal", proposal });
          stamp("Approved");
        } else {
          stamp("Held off");
        }
        next.mode = "watching";
        next.approval = null;
        armCooldown();
      }
      break;
    }
    default:
      break;
  }

  void videoTime;
  return { state: next, effects };
}
