import { cx } from "../cx";

/** Barre de progression (ex. consommation d'un quota). `max` null = illimité. */
export function Progress({
  value,
  max,
  label,
  className,
}: {
  value: number;
  max: number | null;
  label: string;
  className?: string;
}) {
  const ratio = max === null || max === 0 ? (max === 0 ? 1 : 0) : Math.min(1, value / max);
  const tone = ratio >= 1 ? "bg-danger" : ratio >= 0.8 ? "bg-warning" : "bg-primary";
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={max ?? undefined}
      aria-valuenow={value}
      className={cx("h-2 w-full overflow-hidden rounded-full bg-raised", className)}
    >
      <div
        className={cx("h-full rounded-full transition-[width]", tone)}
        style={{ width: `${ratio * 100}%` }}
      />
    </div>
  );
}
