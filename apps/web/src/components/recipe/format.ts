import { type BaseQuantity, scaleQuantity, toDisplayQuantity } from "@culinova/core";

/** Durée lisible : « 45 min », « 1 h 30 ». */
export function formatDuration(seconds: number): string {
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h} h` : `${h} h ${String(m).padStart(2, "0")}`;
}

/** Quantité recalculée pour un autre nombre de personnes, prête à afficher. */
export function scaledDisplay(base: BaseQuantity, from: number, to: number) {
  return toDisplayQuantity(scaleQuantity(base, from, to));
}

/** Mesure « de cuisine » (cuillères…) recalculée, arrondie au demi. */
export function scaledKitchenMeasure(value: number, from: number, to: number): number {
  return Math.max(0.5, Math.round(((value * to) / from) * 2) / 2);
}
