import type { ButtonHTMLAttributes } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/cn";

const buttonVariants = cva(
  "inline-flex items-center justify-center font-medium transition-colors disabled:opacity-50 disabled:pointer-events-none",
  {
    variants: {
      variant: {
        ticket:
          "bg-[var(--ticket)] text-[var(--ink)] border border-[var(--walnut)]/30 px-3 py-1.5 text-sm hover:bg-[var(--cream)]",
        rust: "bg-[var(--rust)] text-[var(--cream)] px-3 py-1.5 text-sm hover:bg-[var(--rust-deep)]",
        quiet: "bg-transparent text-[var(--ink)] underline-offset-4 hover:underline px-1 py-0.5 text-sm",
      },
      size: {
        sm: "text-[13px]",
        md: "text-sm",
      },
    },
    defaultVariants: {
      variant: "ticket",
      size: "md",
    },
  },
);

type Props = ButtonHTMLAttributes<HTMLButtonElement> & VariantProps<typeof buttonVariants>;

export function Button({ className, variant, size, ...props }: Props) {
  return <button className={cn(buttonVariants({ variant, size }), className)} {...props} />;
}
