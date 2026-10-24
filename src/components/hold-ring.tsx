import { cn } from "@/lib/cn";
import type { HoldIntent } from "@/lib/session";

export function HoldRing({
  progress,
  intent,
  className,
}: {
  progress: number;
  intent: HoldIntent | null;
  className?: string;
}) {
  const r = 26;
  const c = 2 * Math.PI * r;
  const p = Math.min(1, Math.max(0, progress));
  const color = intent === "approve" ? "var(--moss)" : intent === "reject" ? "var(--rust)" : "var(--walnut)";

  return (
    <div className={cn("relative h-[76px] w-[76px]", className)} data-testid="hold-ring" data-progress={p.toFixed(2)}>
      <svg viewBox="0 0 64 64" className="h-full w-full -rotate-90">
        <circle cx="32" cy="32" r={r} fill="none" stroke="var(--walnut)" strokeOpacity="0.18" strokeWidth="4" />
        <circle
          cx="32"
          cy="32"
          r={r}
          fill="none"
          stroke={color}
          strokeWidth="5"
          strokeLinecap="butt"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - p)}
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center font-display text-[11px] uppercase tracking-[0.18em] text-[var(--ink)]">
        {intent === "approve" ? "Yes" : intent === "reject" ? "No" : "Hold"}
      </div>
    </div>
  );
}
