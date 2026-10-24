"use client";

import { useEffect, useState } from "react";
import { HoldRing } from "@/components/hold-ring";
import { holdHint, onceHint } from "@/lib/overlay-copy";
import type { PublicController } from "@/lib/video-controller";
import type { Proposal } from "@/lib/proposals";

export function SiteOverlay({
  state,
  miss,
  hint,
  onDismissHint,
}: {
  state: PublicController;
  miss: string | null;
  hint: boolean;
  onDismissHint: () => void;
}) {
  const proposal = state.proposal;
  return (
    <div className="pointer-events-none absolute inset-0 z-20">
      {hint ? (
        <aside className="hint-slip pointer-events-auto" data-testid="first-run-hint">
          <p className="font-display text-[11px] uppercase tracking-[0.18em] text-[var(--walnut)]">Once</p>
          <p className="mt-1 max-w-sm text-[13px] leading-5 text-[var(--ink)]">{onceHint()}</p>
          <button type="button" className="mt-2 text-[12px] text-[var(--rust)] underline underline-offset-4" onClick={onDismissHint}>
            Got it
          </button>
        </aside>
      ) : null}
      {state.stamp ? (
        <div className="gesture-stamp" data-testid="gesture-stamp">
          {state.stamp}
        </div>
      ) : null}
      <div className="pointer-events-none absolute inset-x-3 bottom-3 flex flex-col gap-2">
        {proposal ? <ApprovalCard proposal={proposal} progress={state.holdProgress} intent={state.holdIntent} /> : null}
        {miss ? (
          <article className="miss-card pointer-events-auto" data-testid="miss-card">
            <p className="font-display text-[12px] uppercase tracking-[0.18em] text-[var(--rust)]">You missed a stretch</p>
            <p className="mt-1 max-w-2xl text-[0.98rem] leading-6">{miss}</p>
          </article>
        ) : null}
      </div>
    </div>
  );
}

function ApprovalCard({
  proposal,
  progress,
  intent,
}: {
  proposal: Proposal;
  progress: number;
  intent: "approve" | "reject" | null;
}) {
  return (
    <article className="approval-card pointer-events-auto" data-testid="approval-card" data-kind={proposal.kind}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="font-display text-[11px] uppercase tracking-[0.22em] text-[var(--brass)]">
            {proposal.source === "bridge" ? "A command waits" : proposal.destructive ? "Hold to confirm" : "The model asks"}
          </p>
          <h2 className="mt-1 font-display text-[1.35rem] leading-7 italic">{proposal.title}</h2>
          <p className="mt-1 max-w-xl text-[13px] leading-5 text-[var(--ink)]/80">{proposal.detail}</p>
          <p className="mt-2 text-[11px] text-[var(--walnut)]">{holdHint(proposal)}</p>
        </div>
        <HoldRing progress={progress} intent={intent} />
      </div>
    </article>
  );
}

export function useNow(state: PublicController) {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setTick((n) => n + 1), 250);
    return () => window.clearInterval(id);
  }, [state.mode]);
  return tick;
}
