import { formatRiskKicker } from "./risk";
import type { Proposal } from "./proposals";
import { requiredHoldMs } from "./session";

export function holdHint(proposal: Proposal | null): string {
  const ms = requiredHoldMs(proposal);
  const seconds = (ms / 1000).toFixed(1).replace(/\.0$/, "");
  if (!proposal) return `Hold a thumb about ${seconds}s to agree. Hold a palm to stop.`;
  if (proposal.riskTier === "critical" || proposal.destructive) {
    return `This one can change something. Hold a thumb about ${seconds}s. A flick does nothing.`;
  }
  return `Hold a thumb up to agree. Hold an open palm to stop. About ${seconds}s, so a twitch does not count.`;
}

export function onceHint(): string {
  return "Palm to pause. Swipe to skip. Thumb held to approve. Palm held to refuse. Look away, or press M.";
}

export function approvalKicker(proposal: Proposal): string {
  if (proposal.source === "bridge") {
    return formatRiskKicker(proposal.riskTier, requiredHoldMs(proposal));
  }
  if (proposal.destructive) return "Hold to confirm";
  return "The model asks";
}

