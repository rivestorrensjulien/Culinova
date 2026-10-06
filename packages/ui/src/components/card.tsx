import type { HTMLAttributes } from "react";
import { cx } from "../cx";

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cx("overflow-hidden rounded-lg border border-border bg-surface shadow-soft", className)}
      {...props}
    />
  );
}

export function CardBody({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cx("p-5", className)} {...props} />;
}

export function CardTitle({ className, ...props }: HTMLAttributes<HTMLHeadingElement>) {
  return <h3 className={cx("font-display text-xl leading-tight text-foreground", className)} {...props} />;
}

export function CardDescription({ className, ...props }: HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cx("mt-1 text-sm text-muted", className)} {...props} />;
}
