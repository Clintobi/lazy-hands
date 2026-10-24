import { cn } from "@/lib/cn";

type IconProps = { className?: string; title?: string };

export function HandMark({ className }: IconProps) {
  return (
    <svg viewBox="0 0 48 48" className={cn("fill-none stroke-current", className)} aria-hidden>
      <path
        d="M16 28c0-7 2-16 4-16 1.2 0 2 2 2 8v10M22 20c0-8 1.6-12 3-12s2.4 3 2.4 10v12M27.5 18c0-7 1.6-10 3-10s2.2 3 2.2 9v13M33 22c0-5 1.4-8 2.6-8 1.4 0 2.2 2.4 2.2 7v9c0 7-5 12-13.4 12-7 0-11.4-3.4-13.2-8L10 28"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function LampMark({ className, lit = false }: IconProps & { lit?: boolean }) {
  return (
    <svg viewBox="0 0 32 32" className={cn("stroke-current fill-none", className)} aria-hidden>
      <path d="M16 4v3M8 16H5M27 16h-3M8.8 8.8l-2-2M25.2 8.8l2-2" strokeWidth="1.4" strokeLinecap="round" />
      <circle cx="16" cy="16" r="6.2" className={lit ? "fill-[var(--brass)]/70" : "fill-[var(--walnut)]/15"} strokeWidth="1.5" />
      <path d="M13 23h6l-1 5h-4l-1-5z" strokeWidth="1.4" />
    </svg>
  );
}

export function Sprocket({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={cn("fill-current", className)} aria-hidden>
      <rect x="2" y="4" width="20" height="16" rx="1.2" opacity="0.18" />
      <circle cx="7" cy="8" r="1.3" />
      <circle cx="17" cy="8" r="1.3" />
      <circle cx="7" cy="16" r="1.3" />
      <circle cx="17" cy="16" r="1.3" />
    </svg>
  );
}
