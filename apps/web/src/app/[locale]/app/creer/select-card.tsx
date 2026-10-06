"use client";

import { cx } from "@culinova/ui";
import type { ReactNode } from "react";

/** Carte de choix (une option d'une étape du wizard). */
export function SelectCard({
  selected,
  onSelect,
  title,
  hint,
  disabled,
  children,
}: {
  selected: boolean;
  onSelect: () => void;
  title: string;
  hint?: string | null;
  disabled?: boolean;
  children?: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      disabled={disabled}
      onClick={onSelect}
      className={cx(
        "flex min-h-20 cursor-pointer flex-col items-start justify-center gap-1 rounded-lg border bg-surface p-4 text-left transition-all",
        "hover:border-primary hover:shadow-soft disabled:cursor-not-allowed disabled:opacity-50",
        selected ? "border-primary ring-2 ring-primary/30" : "border-border",
      )}
    >
      <span className="font-display text-lg leading-tight">{title}</span>
      {hint ? <span className="text-sm text-muted">{hint}</span> : null}
      {children}
    </button>
  );
}

/** Pastille de choix (région, pays, cuisine…). */
export function Chip({
  selected,
  onClick,
  children,
  disabled,
}: {
  selected: boolean;
  onClick: () => void;
  children: ReactNode;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      disabled={disabled}
      onClick={onClick}
      className={cx(
        "cursor-pointer rounded-full border px-3 py-1 text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-50",
        selected
          ? "border-foreground bg-foreground text-background"
          : "border-border bg-surface hover:border-primary",
      )}
    >
      {children}
    </button>
  );
}
