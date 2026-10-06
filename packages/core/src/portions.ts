/** Recalcul des quantités selon le nombre de personnes. */
import type { BaseQuantity } from "./units";

export const DEFAULT_SERVINGS = 4;
export const SERVINGS_PRESETS = [2, 4, 6, 8, 10, 20] as const;

function assertServings(servings: number): void {
  if (!Number.isInteger(servings) || servings <= 0) {
    throw new RangeError(`Nombre de personnes invalide : ${servings}`);
  }
}

/** Facteur à appliquer pour passer de `from` à `to` personnes. */
export function scaleFactor(from: number, to: number): number {
  assertServings(from);
  assertServings(to);
  return to / from;
}

/**
 * Recalcule une quantité. Les pièces (œufs…) sont arrondies au demi le plus proche,
 * sans jamais tomber à zéro.
 */
export function scaleQuantity(quantity: BaseQuantity, from: number, to: number): BaseQuantity {
  const value = quantity.value * scaleFactor(from, to);
  if (quantity.dimension === "count") {
    return { dimension: "count", value: Math.max(0.5, Math.round(value * 2) / 2) };
  }
  return { dimension: quantity.dimension, value };
}
