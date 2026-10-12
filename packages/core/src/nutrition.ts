/**
 * Valeurs nutritionnelles d'une recette, à partir des valeurs pour 100 g de
 * chaque ingrédient (table Ciqual, USDA en complément). Valeurs indicatives.
 */

export const NUTRIENT_KEYS = [
  "kcal",
  "kj",
  "fat",
  "saturated",
  "carbs",
  "sugars",
  "fiber",
  "protein",
  "salt",
] as const;
export type NutrientKey = (typeof NUTRIENT_KEYS)[number];
export type Nutrients = Record<NutrientKey, number>;

/** Valeurs pour 100 g, éventuellement incomplètes (valeur inconnue = absente). */
export type Per100g = Partial<Record<NutrientKey, number>>;

export interface NutritionLine {
  /** Poids de l'ingrédient dans la recette, en grammes. */
  grams: number;
  per100g: Per100g;
}

export interface RecipeNutrition {
  total: Nutrients;
  perPortion: Nutrients;
  per100g: Nutrients;
  /** Poids total des ingrédients pris en compte, en grammes. */
  totalGrams: number;
}

const empty = (): Nutrients => Object.fromEntries(NUTRIENT_KEYS.map((key) => [key, 0])) as Nutrients;

/** Arrondi d'affichage : 0 décimale pour l'énergie, 1 pour le reste (2 pour le sel). */
export function roundNutrient(key: NutrientKey, value: number): number {
  const digits = key === "kcal" || key === "kj" ? 0 : key === "salt" ? 2 : 1;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function rounded(values: Nutrients): Nutrients {
  return Object.fromEntries(NUTRIENT_KEYS.map((key) => [key, roundNutrient(key, values[key])])) as Nutrients;
}

/**
 * Somme des apports (poids × valeur pour 100 g). Une valeur inconnue compte pour 0 ;
 * l'énergie en kJ manquante est déduite des kcal (1 kcal = 4,184 kJ).
 */
export function recipeNutrition(lines: readonly NutritionLine[], servings: number): RecipeNutrition {
  if (!Number.isFinite(servings) || servings <= 0) throw new RangeError(`Portions invalides : ${servings}`);
  const total = empty();
  let totalGrams = 0;
  for (const line of lines) {
    if (!Number.isFinite(line.grams) || line.grams <= 0) continue;
    totalGrams += line.grams;
    const ratio = line.grams / 100;
    for (const key of NUTRIENT_KEYS) {
      let value = line.per100g[key];
      if (value === undefined && key === "kj" && line.per100g.kcal !== undefined)
        value = line.per100g.kcal * 4.184;
      if (value !== undefined && Number.isFinite(value)) total[key] += value * ratio;
    }
  }
  const perPortion = empty();
  const per100g = empty();
  for (const key of NUTRIENT_KEYS) {
    perPortion[key] = total[key] / servings;
    per100g[key] = totalGrams > 0 ? (total[key] * 100) / totalGrams : 0;
  }
  return { total: rounded(total), perPortion: rounded(perPortion), per100g: rounded(per100g), totalGrams };
}

/** Valeurs pour 100 g d'une préparation, à partir de ses apports totaux et de son poids final. */
export function per100gOf(total: Nutrients, yieldGrams: number): Per100g {
  if (!(yieldGrams > 0)) return {};
  return Object.fromEntries(NUTRIENT_KEYS.map((key) => [key, (total[key] * 100) / yieldGrams])) as Per100g;
}
