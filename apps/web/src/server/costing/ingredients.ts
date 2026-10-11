/**
 * « Mes ingrédients » : les ingrédients utilisés dans les recettes de la personne
 * (version active) et ceux qu'elle a créés, avec leur prix actuel.
 */
import type { Database } from "@culinova/db";
import * as s from "@culinova/db/schema";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { currentPrices, type PriceUnit, priceUnitOf } from "./prices";

export interface IngredientRow {
  id: string;
  name: string;
  unit: PriceUnit;
  /** Ingrédient créé automatiquement lors d'une génération, à vérifier. */
  toConfirm: boolean;
  own: boolean;
  price: string | null;
  priceIsOwn: boolean;
  supplierName: string | null;
  priceUpdatedAt: string | null;
  /** Recettes (version active) qui l'utilisent. */
  recipes: Array<{ id: string; name: string }>;
}

export async function listMyIngredients(
  db: Database,
  userId: string,
  options: { recipeId?: string; languageCode?: string } = {},
): Promise<IngredientRow[]> {
  const language = options.languageCode ?? "fr";
  const usage = await db
    .select({
      ingredientId: s.recipeIngredients.ingredientId,
      recipeId: s.recipes.id,
      recipeName: s.recipeVersions.name,
    })
    .from(s.recipes)
    .innerJoin(s.recipeVersions, eq(s.recipeVersions.id, s.recipes.currentVersionId))
    .innerJoin(s.recipeIngredients, eq(s.recipeIngredients.recipeVersionId, s.recipeVersions.id))
    .where(
      and(
        eq(s.recipes.ownerId, userId),
        isNull(s.recipes.deletedAt),
        options.recipeId ? eq(s.recipes.id, options.recipeId) : undefined,
      ),
    );

  const recipesByIngredient = new Map<string, Map<string, string>>();
  for (const row of usage) {
    if (!row.ingredientId) continue;
    const map = recipesByIngredient.get(row.ingredientId) ?? new Map<string, string>();
    map.set(row.recipeId, row.recipeName);
    recipesByIngredient.set(row.ingredientId, map);
  }

  const ownIds = options.recipeId
    ? []
    : (
        await db
          .select({ id: s.ingredients.id })
          .from(s.ingredients)
          .where(and(eq(s.ingredients.ownerId, userId), isNull(s.ingredients.deletedAt)))
      ).map((r) => r.id);
  const ids = [...new Set([...recipesByIngredient.keys(), ...ownIds])];
  if (ids.length === 0) return [];

  const [details, prices] = await Promise.all([
    db
      .select({
        id: s.ingredients.id,
        canonicalName: s.ingredients.canonicalName,
        referenceUnit: s.ingredients.referenceUnit,
        status: s.ingredients.status,
        ownerId: s.ingredients.ownerId,
        translated: sql<string | null>`(
          select ${s.ingredientTranslations.name} from ${s.ingredientTranslations}
          where ${s.ingredientTranslations.ingredientId} = ${s.ingredients.id}
            and ${s.ingredientTranslations.languageCode} = ${language}
        )`,
      })
      .from(s.ingredients)
      .where(and(inArray(s.ingredients.id, ids), isNull(s.ingredients.deletedAt))),
    currentPrices(db, userId, ids),
  ]);

  return details
    .map((d) => {
      const price = prices.get(d.id);
      return {
        id: d.id,
        name: d.translated ?? d.canonicalName,
        unit: priceUnitOf(d.referenceUnit),
        toConfirm: d.status === "to_confirm",
        own: d.ownerId === userId,
        price: price?.price ?? null,
        priceIsOwn: price?.own ?? false,
        supplierName: price?.supplierName ?? null,
        priceUpdatedAt: price?.validFrom.toISOString() ?? null,
        recipes: [...(recipesByIngredient.get(d.id) ?? new Map())].map(([id, name]) => ({ id, name })),
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name, language));
}

/** Confirme un ingrédient créé automatiquement par une génération. */
export async function confirmIngredient(
  db: Database,
  userId: string,
  ingredientId: string,
): Promise<boolean> {
  const updated = await db
    .update(s.ingredients)
    .set({ status: "confirmed" })
    .where(and(eq(s.ingredients.id, ingredientId), eq(s.ingredients.ownerId, userId)))
    .returning({ id: s.ingredients.id });
  return updated.length > 0;
}
