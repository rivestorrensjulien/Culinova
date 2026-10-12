/**
 * Coût matière d'une version de recette, calculé à la volée à partir des prix
 * actuels (jamais saisi). Les ingrédients sans prix sont signalés.
 */
import { type CostLine, divRound, materialCost, parsePrice } from "@culinova/core";
import type { Database } from "@culinova/db";
import * as s from "@culinova/db/schema";
import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import { currentPrices } from "./prices";

export interface RecipeCost {
  /** Coût matière total pour le nombre de personnes de la version, en centimes (ingrédients chiffrés seulement). */
  totalCents: number;
  perPortionCents: number;
  /** Nombre d'ingrédients chiffrés / nombre total d'ingrédients. */
  pricedCount: number;
  lineCount: number;
  /**
   * Ingrédients qu'il reste à chiffrer : prix absent, poids à la pièce / densité manquants,
   * ou préparation maison (« base ») dont des ingrédients n'ont pas encore de prix.
   */
  missing: Array<{ ingredientId: string | null; label: string; reason: "price" | "conversion" | "base" }>;
  /** Ingrédients chiffrés avec un prix estimé par l'IA, pas encore confirmé (base maison : sa ligne). */
  estimated: Array<{ ingredientId: string | null; label: string }>;
}

/** Profondeur maximale des bases imbriquées (une base dans une base). */
const MAX_BASE_DEPTH = 2;

const DIMENSION = { g: "mass", ml: "volume", piece: "count" } as const;

export async function computeRecipeCost(
  db: Database,
  userId: string,
  versionId: string,
  servings: number,
  depth = 0,
): Promise<RecipeCost> {
  const rows = await db
    .select({
      label: s.recipeIngredients.label,
      ingredientId: s.recipeIngredients.ingredientId,
      g: s.recipeIngredients.quantityG,
      ml: s.recipeIngredients.quantityMl,
      piece: s.recipeIngredients.quantityPiece,
      referenceUnit: s.ingredients.referenceUnit,
      density: s.ingredients.densityGPerMl,
      pieceWeight: s.ingredients.pieceWeightG,
      baseRecipeId: s.recipeIngredients.baseRecipeId,
    })
    .from(s.recipeIngredients)
    .leftJoin(s.ingredients, eq(s.ingredients.id, s.recipeIngredients.ingredientId))
    .where(eq(s.recipeIngredients.recipeVersionId, versionId))
    .orderBy(asc(s.recipeIngredients.sortOrder));

  const ids = rows.flatMap((r) => (r.ingredientId && !r.baseRecipeId ? [r.ingredientId] : []));
  const prices = await currentPrices(db, userId, ids);
  const bases = await baseCosts(db, userId, rows, depth);
  const lines: CostLine[] = [];
  const missing: RecipeCost["missing"] = [];
  const estimated: RecipeCost["estimated"] = [];
  let homemadeCents = 0;
  let homemadeCount = 0;

  for (const row of rows) {
    // Préparation faite maison : son coût (au prorata du poids utilisé) remplace le prix d'achat.
    if (row.baseRecipeId) {
      const base = bases.get(row.baseRecipeId);
      const grams = row.g === null ? null : Number(row.g);
      if (!base || grams === null || base.cost.pricedCount === 0) {
        missing.push({ ingredientId: row.ingredientId, label: row.label, reason: "base" });
        continue;
      }
      homemadeCents += Number(
        divRound(BigInt(base.cost.totalCents) * BigInt(Math.round(grams * 1000)), BigInt(base.yieldG * 1000)),
      );
      homemadeCount += 1;
      if (base.cost.estimated.length > 0)
        estimated.push({ ingredientId: row.ingredientId, label: row.label });
      if (base.cost.missing.length > 0) {
        missing.push({ ingredientId: row.ingredientId, label: row.label, reason: "base" });
      }
      continue;
    }
    if (!row.ingredientId || !row.referenceUnit) continue;
    const price = prices.get(row.ingredientId);
    if (!price) {
      missing.push({ ingredientId: row.ingredientId, label: row.label, reason: "price" });
      continue;
    }
    const quantity =
      row.g !== null
        ? { dimension: "mass" as const, value: Number(row.g) }
        : row.ml !== null
          ? { dimension: "volume" as const, value: Number(row.ml) }
          : { dimension: "count" as const, value: Number(row.piece ?? 0) };
    const line: CostLine = {
      quantity,
      price: { dimension: DIMENSION[row.referenceUnit], amount: parsePrice(price.price) },
      ...(row.density !== null ? { densityGramsPerMl: Number(row.density) } : {}),
      ...(row.pieceWeight !== null ? { pieceWeightGrams: Number(row.pieceWeight) } : {}),
    };
    try {
      // Vérifie que la conversion est possible avant de compter la ligne.
      materialCost([line], 1);
      lines.push(line);
      if (price.estimated) estimated.push({ ingredientId: row.ingredientId, label: row.label });
    } catch {
      missing.push({ ingredientId: row.ingredientId, label: row.label, reason: "conversion" });
    }
  }

  const portions = Math.max(1, Math.round(servings));
  const totalCents = materialCost(lines, portions).totalCents + homemadeCents;
  return {
    totalCents,
    perPortionCents: Number(divRound(BigInt(totalCents), BigInt(portions))),
    pricedCount: lines.length + homemadeCount,
    lineCount: rows.filter((r) => r.ingredientId || r.baseRecipeId).length,
    missing,
    estimated,
  };
}

/** Coût de chaque base utilisée (version active, pour toute la fournée). */
async function baseCosts(
  db: Database,
  userId: string,
  rows: Array<{ baseRecipeId: string | null }>,
  depth: number,
): Promise<Map<string, { yieldG: number; cost: RecipeCost }>> {
  const result = new Map<string, { yieldG: number; cost: RecipeCost }>();
  const ids = [...new Set(rows.flatMap((r) => (r.baseRecipeId ? [r.baseRecipeId] : [])))];
  if (ids.length === 0 || depth >= MAX_BASE_DEPTH) return result;
  const bases = await db
    .select({ id: s.baseRecipes.id, yieldG: s.baseRecipes.yieldG, versionId: s.recipes.currentVersionId })
    .from(s.baseRecipes)
    .innerJoin(s.recipes, eq(s.recipes.id, s.baseRecipes.recipeId))
    .where(and(inArray(s.baseRecipes.id, ids), eq(s.recipes.ownerId, userId), isNull(s.recipes.deletedAt)));
  for (const base of bases) {
    if (!base.versionId || base.yieldG <= 0) continue;
    const cost = await computeRecipeCost(db, userId, base.versionId, 1, depth + 1);
    result.set(base.id, { yieldG: base.yieldG, cost });
  }
  return result;
}
