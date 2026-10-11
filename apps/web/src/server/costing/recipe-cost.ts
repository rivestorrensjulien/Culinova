/**
 * Coût matière d'une version de recette, calculé à la volée à partir des prix
 * actuels (jamais saisi). Les ingrédients sans prix sont signalés.
 */
import { type CostLine, materialCost, parsePrice } from "@culinova/core";
import type { Database } from "@culinova/db";
import * as s from "@culinova/db/schema";
import { asc, eq } from "drizzle-orm";
import { currentPrices } from "./prices";

export interface RecipeCost {
  /** Coût matière total pour le nombre de personnes de la version, en centimes (ingrédients chiffrés seulement). */
  totalCents: number;
  perPortionCents: number;
  /** Nombre d'ingrédients chiffrés / nombre total d'ingrédients. */
  pricedCount: number;
  lineCount: number;
  /** Ingrédients qu'il reste à chiffrer : prix absent, ou poids à la pièce / densité manquants. */
  missing: Array<{ ingredientId: string; label: string; reason: "price" | "conversion" }>;
}

const DIMENSION = { g: "mass", ml: "volume", piece: "count" } as const;

export async function computeRecipeCost(
  db: Database,
  userId: string,
  versionId: string,
  servings: number,
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
    })
    .from(s.recipeIngredients)
    .leftJoin(s.ingredients, eq(s.ingredients.id, s.recipeIngredients.ingredientId))
    .where(eq(s.recipeIngredients.recipeVersionId, versionId))
    .orderBy(asc(s.recipeIngredients.sortOrder));

  const ids = rows.flatMap((r) => (r.ingredientId ? [r.ingredientId] : []));
  const prices = await currentPrices(db, userId, ids);
  const lines: CostLine[] = [];
  const missing: RecipeCost["missing"] = [];

  for (const row of rows) {
    // Les préparations de « Mes bases » seront chiffrées avec leur propre coût (jalon J3.3).
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
    } catch {
      missing.push({ ingredientId: row.ingredientId, label: row.label, reason: "conversion" });
    }
  }

  const portions = Math.max(1, Math.round(servings));
  const cost = materialCost(lines, portions);
  return {
    totalCents: cost.totalCents,
    perPortionCents: cost.perPortionCents,
    pricedCount: lines.length,
    lineCount: rows.filter((r) => r.ingredientId).length,
    missing,
  };
}
