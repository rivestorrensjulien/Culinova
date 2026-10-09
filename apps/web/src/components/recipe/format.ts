import { type BaseQuantity, scaleQuantity, toDisplayQuantity, type Unit } from "@culinova/core";

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

/**
 * Dressage raconté en phrases. Les recettes récentes ont une description rédigée ;
 * pour les plus anciennes, on la reconstitue à partir des champs détaillés.
 */
export function platingText(plating: {
  description?: string | null;
  plate: string;
  positioning: string;
  quantities: string;
  sauce: string | null;
  garnish: string | null;
  finish: string | null;
  decoration: string | null;
}): string {
  if (plating.description?.trim()) return plating.description.trim();
  return [
    plating.plate,
    plating.positioning,
    plating.sauce,
    plating.garnish,
    plating.finish,
    plating.decoration,
  ]
    .map((part) => part?.trim().replace(/[.\s]+$/, ""))
    .filter((part): part is string => Boolean(part))
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(". ")
    .concat(".");
}

/** Mesure « de cuisine » (cuillères…) recalculée, arrondie au demi. */
export function scaledKitchenMeasure(value: number, from: number, to: number): number {
  return Math.max(0.5, Math.round(((value * to) / from) * 2) / 2);
}

/** Poids affiché en grammes, arrondi selon sa taille (1,5 g · 23 g · 375 g). */
function roundGrams(value: number): number {
  if (value < 10) return Math.round(value * 10) / 10;
  if (value < 100) return Math.round(value);
  return Math.round(value / 5) * 5;
}

export interface IngredientAmount {
  value: number;
  unit: Unit;
  /** Mesure parlante entre parenthèses (3 œufs, 1 pincée, 30 cl), si l'ingrédient en a une. */
  kitchen: { value: number; unit: string } | null;
}

/**
 * Quantité d'un ingrédient (ou d'une partie, `part`), recalculée pour un autre
 * nombre de personnes : toujours en grammes d'abord, puis la mesure parlante.
 * Les anciennes recettes en millilitres ou en pièces gardent leur unité.
 */
export function ingredientAmount(
  ingredient: {
    dimension: "mass" | "volume" | "count";
    quantity: number;
    displayQuantity: number | null;
    displayUnit: string | null;
  },
  part: number | null,
  from: number,
  to: number,
): IngredientAmount {
  const base = part ?? ingredient.quantity;
  const kitchen =
    ingredient.displayQuantity !== null && ingredient.displayUnit && ingredient.quantity > 0
      ? {
          value: scaledKitchenMeasure((ingredient.displayQuantity * base) / ingredient.quantity, from, to),
          unit: ingredient.displayUnit,
        }
      : null;
  if (ingredient.dimension === "mass") {
    return { value: roundGrams((base * to) / from), unit: "g", kitchen };
  }
  const display = scaledDisplay({ dimension: ingredient.dimension, value: base }, from, to);
  return { ...display, kitchen };
}
