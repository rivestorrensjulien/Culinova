import {
  agreeKitchenUnit,
  type BaseQuantity,
  estimateKitchenMeasure,
  scaleQuantity,
  toDisplayQuantity,
  type Unit,
} from "@culinova/core";

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
 * nombre de personnes : toujours en grammes d'abord, puis la mesure parlante (P3) —
 * celle de l'IA, ou à défaut celle déduite du nom et du poids (`estimateKitchenMeasure` :
 * œufs, gousses, cuillères, centilitres), l'unité accordée au nombre (« 1 œuf »).
 * Les anciennes recettes en millilitres ou en pièces gardent leur unité.
 */
export function ingredientAmount(
  ingredient: {
    dimension: "mass" | "volume" | "count";
    quantity: number;
    displayQuantity: number | null;
    displayUnit: string | null;
    /** Nom de l'ingrédient : sert à déduire la mesure quand l'IA n'en a pas donné. */
    label?: string;
  },
  part: number | null,
  from: number,
  to: number,
  lang: "fr" | "en" = "fr",
): IngredientAmount {
  const base = part ?? ingredient.quantity;
  let kitchen: IngredientAmount["kitchen"] = null;
  if (ingredient.displayQuantity !== null && ingredient.displayUnit && ingredient.quantity > 0) {
    const value = scaledKitchenMeasure((ingredient.displayQuantity * base) / ingredient.quantity, from, to);
    kitchen = { value, unit: agreeKitchenUnit(value, ingredient.displayUnit) };
  } else if (ingredient.dimension === "mass" && ingredient.label) {
    kitchen = estimateKitchenMeasure(ingredient.label, (base * to) / from, { lang });
  }
  if (ingredient.dimension === "mass") {
    return { value: roundGrams((base * to) / from), unit: "g", kitchen };
  }
  const display = scaledDisplay({ dimension: ingredient.dimension, value: base }, from, to);
  return { ...display, kitchen };
}

/**
 * Mesure parlante d'un article de courses ou du garde-manger (P3) : nombre de pièces ou
 * volume d'un liquide (« 6 œufs », « 50 cl »), jamais de cuillères. Null si rien ne parle mieux
 * que le poids.
 */
export function shoppingKitchenMeasure(
  name: string,
  quantity: { dimension: "mass" | "volume" | "count"; value: number },
  lang: string,
): { value: number; unit: string } | null {
  if (quantity.dimension !== "mass") return null;
  return estimateKitchenMeasure(name, quantity.value, {
    lang: lang === "en" ? "en" : "fr",
    uses: "shopping",
  });
}
