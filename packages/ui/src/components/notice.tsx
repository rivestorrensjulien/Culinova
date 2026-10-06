import type { HTMLAttributes } from "react";
import { cx } from "../cx";

export type NoticeTone = "info" | "success" | "warning" | "danger";

const tones: Record<NoticeTone, string> = {
  info: "border-border bg-raised text-foreground",
  success: "border-success/40 bg-success/10 text-foreground",
  warning: "border-warning/40 bg-warning/10 text-foreground",
  danger: "border-danger/40 bg-danger/10 text-foreground",
};

/** Message encadré (information, succès, avertissement, erreur). */
export function Notice({
  tone = "info",
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & { tone?: NoticeTone }) {
  return (
    <div
      role={tone === "danger" || tone === "warning" ? "alert" : "status"}
      className={cx("rounded-md border px-4 py-3 text-sm", tones[tone], className)}
      {...props}
    />
  );
}
