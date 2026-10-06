/** Mise en forme des valeurs dans l'administration (en français). */

export function formatDate(date: Date | null | undefined, withTime = false): string {
  if (!date) return "—";
  return date.toLocaleString("fr-FR", {
    timeZone: "Europe/Paris",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    ...(withTime ? { hour: "2-digit", minute: "2-digit" } : {}),
  });
}

/** Coût IA en micro-dollars → « 0,42 $ ». */
export function formatUsdMicros(micros: number): string {
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  }).format(micros / 1_000_000);
}

export const thClass = "px-3 py-2 text-left text-xs font-medium tracking-wide text-muted uppercase";
export const tdClass = "px-3 py-2 align-top";
