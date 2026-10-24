import { HOLD_MS } from "./session";
import type { Proposal } from "./proposals";

export function holdHint(proposal: Proposal | null): string {
  if (!proposal) return `Hold a thumb about ${HOLD_MS / 1000}s to agree. Hold a palm to stop.`;
  if (proposal.destructive) {
    return `This one can change something. Hold a thumb about ${HOLD_MS / 1000}s. A flick does nothing.`;
  }
  return `Hold a thumb up to agree. Hold an open palm to stop. About ${HOLD_MS / 1000}s, so a twitch does not count.`;
}

export function onceHint(): string {
  return "Palm to pause. Swipe to skip. Thumb held to approve. Palm held to refuse. Look away, or press M.";
}
