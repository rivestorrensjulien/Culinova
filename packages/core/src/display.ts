/** Quantités prêtes à afficher (unité lisible, arrondi raisonnable). */
import { type BaseQuantity, bestDisplayUnit, fromBase, type Unit } from "./units";

export interface DisplayQuantity {
  value: number;
  unit: Unit;
}

/** Arrondi d'affichage : précis pour les petites valeurs, entier au-delà. */
function roundForDisplay(value: number, unit: Unit): number {
  if (unit === "piece") return Math.round(value * 2) / 2;
  if (unit === "kg" || unit === "l") return Math.round(value * 100) / 100;
  if (unit === "cl") return Math.round(value * 10) / 10;
  if (value < 10) return Math.round(value * 10) / 10;
  if (value < 100) return Math.round(value);
  return Math.round(value / 5) * 5;
}

export function toDisplayQuantity(base: BaseQuantity): DisplayQuantity {
  const unit = bestDisplayUnit(base);
  return { value: roundForDisplay(fromBase(base, unit), unit), unit };
}
