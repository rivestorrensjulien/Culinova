/**
 * USDA FoodData Central, en complément de Ciqual pour les ingrédients qui n'y
 * figurent pas. Clé gratuite (variable USDA_FDC_API_KEY) ; sans clé, rien n'est appelé.
 */
import type { NutritionValues } from "@culinova/db/schema";

const SEARCH_URL = "https://api.nal.usda.gov/fdc/v1/foods/search";

/** Identifiants des nutriments FoodData Central → clés internes (valeurs pour 100 g). */
const NUTRIENTS: Record<number, keyof NutritionValues> = {
  1008: "kcal",
  1062: "kj",
  1003: "protein",
  1005: "carbs",
  2000: "sugars",
  1079: "fiber",
  1004: "fat",
  1258: "saturated",
};
/** Énergie calculée (Atwater), quand l'énergie « 1008 » manque (aliments « Foundation »). */
const ENERGY_FALLBACKS = [2048, 2047];
const SODIUM = 1093;

export interface UsdaFood {
  fdcId: number;
  description: string;
  per100g: NutritionValues;
}

interface SearchResponse {
  foods?: Array<{
    fdcId: number;
    description: string;
    foodNutrients?: Array<{ nutrientId: number; value?: number; unitName?: string }>;
  }>;
}

export async function searchUsda(
  query: string,
  apiKey: string | undefined,
  fetchImpl: typeof fetch = fetch,
): Promise<UsdaFood | null> {
  if (!apiKey || !query.trim()) return null;
  const url = new URL(SEARCH_URL);
  url.searchParams.set("query", query.trim());
  url.searchParams.set("dataType", "Foundation,SR Legacy");
  url.searchParams.set("pageSize", "3");
  url.searchParams.set("api_key", apiKey);
  try {
    const response = await fetchImpl(url, { signal: AbortSignal.timeout(10_000) });
    if (!response.ok) return null;
    const data = (await response.json()) as SearchResponse;
    const food = data.foods?.[0];
    if (!food) return null;
    const values = new Map((food.foodNutrients ?? []).map((n) => [n.nutrientId, n]));
    const per100g: NutritionValues = {};
    for (const [id, key] of Object.entries(NUTRIENTS)) {
      const value = values.get(Number(id))?.value;
      if (typeof value === "number") per100g[key] = value;
    }
    if (per100g.kcal === undefined) {
      for (const id of ENERGY_FALLBACKS) {
        const value = values.get(id)?.value;
        if (typeof value === "number") {
          per100g.kcal = value;
          break;
        }
      }
    }
    const sodium = values.get(SODIUM);
    if (typeof sodium?.value === "number") {
      // Sodium en mg → sel en g (sel = sodium × 2,5).
      const grams = sodium.unitName?.toLowerCase() === "g" ? sodium.value : sodium.value / 1000;
      per100g.salt = Math.round(grams * 2.5 * 1000) / 1000;
    }
    return { fdcId: food.fdcId, description: food.description, per100g };
  } catch {
    return null;
  }
}
