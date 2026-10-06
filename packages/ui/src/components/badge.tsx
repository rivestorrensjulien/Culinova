import type { HTMLAttributes } from "react";
import { cx } from "../cx";

export type BadgeTone = "neutral" | "accent" | "sage" | "success" | "warning" | "danger";

const tones: Record<BadgeTone, string> = {
  neutral: "bg-raised text-foreground border-border",
  accent: "bg-soft text-soft-foreground border-transparent",
  sage: "bg-sage text-sage-foreground border-transparent",
  success: "text-success border-current",
  warning: "text-warning border-current",
  danger: "text-danger border-current",
};

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: BadgeTone;
}

export function Badge({ tone = "neutral", className, ...props }: BadgeProps) {
  return (
    <span
      className={cx(
        "inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium",
        tones[tone],
        className,
      )}
      {...props}
    />
  );
}
