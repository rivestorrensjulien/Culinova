/**
 * Valeurs nutritionnelles d'une version de recette, calculées à l'affichage à partir
 * des correspondances ingrédient → aliment de la personne. Une préparation faite
 * maison est comptée d'après ses propres ingrédients, au prorata du poids utilisé.
 */
import {
  NUTRIENT_KEYS,
  type Nutrients,
  type NutritionLine,
  per100gOf,
  recipeNutrition,
  roundNutrient,
} from "@culinova/core";
import type { Database } from "@culinova/db";
import * as s from "@culinova/db/schema";
import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import { foodName } from "./foods";

export interface NutritionLineView {
  ingredientId: string | null;
  label: string;
  /** Aliment retenu ; null si aucune correspondance (ou pas encore proposée). */
  food: { id: string; name: string; source: "ciqual" | "usda"; code: string } | null;
  /** « proposed » : à valider ; « validated » ; « none » : pas encore de correspondance ; « homemade » : base maison. */
  status: "proposed" | "validated" | "none" | "homemade";
}

export interface NutritionView {
  perPortion: Nutrients;
  per100g: Nutrients;
  /** Apports de toute la recette (une base : toute la fournée). */
  total: Nutrients;
  /** Lignes comptées / lignes pesables. */
  counted: number;
  lineCount: number;
  lines: NutritionLineView[];
  /** Correspondances proposées par l'IA, pas encore validées. */
  toValidate: number;
}

const MAX_DEPTH = 2;

/** Poids en grammes d'une ligne (anciennes recettes : volume × densité, pièces × poids moyen). */
function gramsOf(row: {
  g: string | null;
  ml: string | null;
  piece: string | null;
  density: string | null;
  pieceWeight: string | null;
}): number | null {
  if (row.g !== null) return Number(row.g);
  if (row.ml !== null) return Number(row.ml) * (row.density === null ? 1 : Number(row.density));
  if (row.piece !== null && row.pieceWeight !== null) return Number(row.piece) * Number(row.pieceWeight);
  return null;
}

export async function computeRecipeNutrition(
  db: Database,
  userId: string,
  versionId: string,
  servings: number,
  options: { language?: string; yieldG?: number | null; depth?: number } = {},
): Promise<NutritionView> {
  const language = options.language ?? "fr";
  const depth = options.depth ?? 0;
  const rows = await db
    .select({
      label: s.recipeIngredients.label,
      ingredientId: s.recipeIngredients.ingredientId,
      baseRecipeId: s.recipeIngredients.baseRecipeId,
      g: s.recipeIngredients.quantityG,
      ml: s.recipeIngredients.quantityMl,
      piece: s.recipeIngredients.quantityPiece,
      density: s.ingredients.densityGPerMl,
      pieceWeight: s.ingredients.pieceWeightG,
    })
    .from(s.recipeIngredients)
    .leftJoin(s.ingredients, eq(s.ingredients.id, s.recipeIngredients.ingredientId))
    .where(eq(s.recipeIngredients.recipeVersionId, versionId))
    .orderBy(asc(s.recipeIngredients.sortOrder));

  const ingredientIds = rows.flatMap((r) => (r.ingredientId && !r.baseRecipeId ? [r.ingredientId] : []));
  const links =
    ingredientIds.length === 0
      ? []
      : await db
          .select({ link: s.ingredientNutritionLinks, food: s.nutritionFoods })
          .from(s.ingredientNutritionLinks)
          .leftJoin(s.nutritionFoods, eq(s.nutritionFoods.id, s.ingredientNutritionLinks.foodId))
          .where(
            and(
              eq(s.ingredientNutritionLinks.ownerId, userId),
              inArray(s.ingredientNutritionLinks.ingredientId, ingredientIds),
            ),
          );
  const linkOf = new Map(links.map((l) => [l.link.ingredientId, l]));

  // Préparations faites maison : valeurs pour 100 g d'après leurs propres ingrédients.
  const baseIds = [...new Set(rows.flatMap((r) => (r.baseRecipeId ? [r.baseRecipeId] : [])))];
  const bases = new Map<string, { per100g: NutritionLine["per100g"]; counted: number }>();
  if (baseIds.length > 0 && depth < MAX_DEPTH) {
    const baseRows = await db
      .select({ id: s.baseRecipes.id, yieldG: s.baseRecipes.yieldG, versionId: s.recipes.currentVersionId })
      .from(s.baseRecipes)
      .innerJoin(s.recipes, eq(s.recipes.id, s.baseRecipes.recipeId))
      .where(
        and(inArray(s.baseRecipes.id, baseIds), eq(s.recipes.ownerId, userId), isNull(s.recipes.deletedAt)),
      );
    for (const base of baseRows) {
      if (!base.versionId) continue;
      const view = await computeRecipeNutrition(db, userId, base.versionId, 1, {
        language,
        yieldG: base.yieldG,
        depth: depth + 1,
      });
      bases.set(base.id, { per100g: per100gOf(view.total, base.yieldG), counted: view.counted });
    }
  }

  const lines: NutritionLine[] = [];
  const views: NutritionLineView[] = [];
  let lineCount = 0;
  for (const row of rows) {
    const grams = gramsOf(row);
    if (grams === null) continue;
    lineCount += 1;
    if (row.baseRecipeId) {
      const base = bases.get(row.baseRecipeId);
      if (base && base.counted > 0) lines.push({ grams, per100g: base.per100g });
      views.push({ ingredientId: row.ingredientId, label: row.label, food: null, status: "homemade" });
      continue;
    }
    const linked = row.ingredientId ? linkOf.get(row.ingredientId) : undefined;
    const food = linked?.food ?? null;
    if (food) lines.push({ grams, per100g: food.per100g });
    views.push({
      ingredientId: row.ingredientId,
      label: row.label,
      food: food
        ? { id: food.id, name: foodName(food, language), source: food.source, code: food.code }
        : null,
      status: linked ? linked.link.status : "none",
    });
  }

  const result = recipeNutrition(lines, Math.max(1, servings));
  // Une base se rapporte à son poids final (cuisson, évaporation), un plat au poids de ses ingrédients.
  const baseYield = options.yieldG && options.yieldG > 0 ? options.yieldG : null;
  const basePer100g = baseYield ? per100gOf(result.total, baseYield) : null;
  return {
    perPortion: result.perPortion,
    per100g: basePer100g
      ? (Object.fromEntries(
          NUTRIENT_KEYS.map((key) => [key, roundNutrient(key, basePer100g[key] ?? 0)]),
        ) as Nutrients)
      : result.per100g,
    total: result.total,
    counted: lines.length,
    lineCount,
    lines: views,
    toValidate: views.filter((v) => v.status === "proposed").length,
  };
}
