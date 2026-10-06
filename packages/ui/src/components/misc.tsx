import type { HTMLAttributes } from "react";
import { cx } from "../cx";

export function Separator({ className, ...props }: HTMLAttributes<HTMLHRElement>) {
  return <hr className={cx("border-0 border-t border-border", className)} {...props} />;
}

export function Kbd({ className, ...props }: HTMLAttributes<HTMLElement>) {
  return (
    <kbd
      className={cx(
        "inline-flex h-6 min-w-6 items-center justify-center rounded-sm border border-border-strong bg-raised px-1.5 font-sans text-xs text-muted",
        className,
      )}
      {...props}
    />
  );
}

export function Skeleton({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div aria-hidden className={cx("animate-pulse rounded-md bg-raised", className)} {...props} />;
}

export function Spinner({ className, label = "Chargement…" }: { className?: string; label?: string }) {
  return (
    <span role="status" className={cx("inline-flex items-center", className)}>
      <span className="size-4 animate-spin rounded-full border-2 border-current border-r-transparent" />
      <span className="sr-only">{label}</span>
    </span>
  );
}
