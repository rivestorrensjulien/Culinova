/**
 * Listes de courses : ingrédients de plusieurs recettes additionnés (200 g + 300 g de riz
 * = 500 g), rangés par rayon, avec une estimation du coût. Une préparation faite maison
 * est remplacée par ses propres ingrédients, au prorata du poids utilisé.
 */
import {
  type BaseQuantity,
  type CostLine,
  materialCost,
  mergeShoppingItems,
  parsePrice,
} from "@culinova/core";
import type { Database } from "@culinova/db";
import * as s from "@culinova/db/schema";
import { and, asc, desc, eq, inArray, isNull } from "drizzle-orm";
import { currentPrices } from "../costing/prices";
import { availableStock, stockKey } from "./stock";

export interface ShoppingEntry {
  recipeId: string;
  servings: number;
}

export interface ShoppingNeed {
  ingredientId: string;
  quantity: BaseQuantity;
  sources: Array<{ recipeId: string; quantity: number }>;
}

/** Profondeur maximale des bases imbriquées. */
const MAX_DEPTH = 2;

interface RawNeed {
  ingredientId: string;
  quantity: number;
  unit: "g" | "ml" | "piece";
  recipeId: string;
}

/** Besoins d'une version de recette, multipliés par `factor` (bases développées). */
async function versionNeeds(
  db: Database,
  userId: string,
  versionId: string,
  factor: number,
  recipeId: string,
  depth: number,
): Promise<RawNeed[]> {
  const rows = await db
    .select({
      ingredientId: s.recipeIngredients.ingredientId,
      g: s.recipeIngredients.quantityG,
      ml: s.recipeIngredients.quantityMl,
      piece: s.recipeIngredients.quantityPiece,
      baseVersionId: s.recipes.currentVersionId,
      baseYieldG: s.baseRecipes.yieldG,
    })
    .from(s.recipeIngredients)
    .leftJoin(s.baseRecipes, eq(s.baseRecipes.id, s.recipeIngredients.baseRecipeId))
    .leftJoin(
      s.recipes,
      and(
        eq(s.recipes.id, s.baseRecipes.recipeId),
        eq(s.recipes.ownerId, userId),
        isNull(s.recipes.deletedAt),
      ),
    )
    .where(eq(s.recipeIngredients.recipeVersionId, versionId));

  const needs: RawNeed[] = [];
  for (const row of rows) {
    if (row.baseVersionId && row.baseYieldG && row.g !== null && depth < MAX_DEPTH) {
      // Fait maison : on achète les ingrédients de la base, pas le produit tout prêt.
      const grams = Number(row.g) * factor;
      needs.push(
        ...(await versionNeeds(db, userId, row.baseVersionId, grams / row.baseYieldG, recipeId, depth + 1)),
      );
      continue;
    }
    if (!row.ingredientId) continue;
    const [quantity, unit] =
      row.g !== null
        ? [Number(row.g), "g" as const]
        : row.ml !== null
          ? [Number(row.ml), "ml" as const]
          : [Number(row.piece ?? 0), "piece" as const];
    if (quantity > 0)
      needs.push({ ingredientId: row.ingredientId, quantity: quantity * factor, unit, recipeId });
  }
  return needs;
}

/** Besoins additionnés de plusieurs recettes, chacune pour son nombre de personnes. */
export async function buildShoppingNeeds(
  db: Database,
  userId: string,
  entries: readonly ShoppingEntry[],
): Promise<ShoppingNeed[]> {
  const ids = [...new Set(entries.map((e) => e.recipeId))];
  if (ids.length === 0) return [];
  const versions = await db
    .select({ recipeId: s.recipes.id, versionId: s.recipeVersions.id, servings: s.recipeVersions.servings })
    .from(s.recipes)
    .innerJoin(s.recipeVersions, eq(s.recipeVersions.id, s.recipes.currentVersionId))
    .where(and(inArray(s.recipes.id, ids), eq(s.recipes.ownerId, userId), isNull(s.recipes.deletedAt)));

  const raw: RawNeed[] = [];
  for (const entry of entries) {
    const version = versions.find((v) => v.recipeId === entry.recipeId);
    if (!version || entry.servings <= 0) continue;
    const factor = entry.servings / Math.max(1, Number(version.servings));
    raw.push(...(await versionNeeds(db, userId, version.versionId, factor, entry.recipeId, 0)));
  }

  const merged = mergeShoppingItems(
    raw.map((n) => ({ ingredientId: n.ingredientId, quantity: n.quantity, unit: n.unit })),
  );
  return merged.map((item) => {
    const sources = new Map<string, number>();
    for (const need of raw) {
      const dimension = need.unit === "g" ? "mass" : need.unit === "ml" ? "volume" : "count";
      if (need.ingredientId !== item.ingredientId || dimension !== item.quantity.dimension) continue;
      sources.set(need.recipeId, (sources.get(need.recipeId) ?? 0) + need.quantity);
    }
    return {
      ingredientId: item.ingredientId,
      quantity: item.quantity,
      sources: [...sources].map(([recipeId, quantity]) => ({
        recipeId,
        quantity: Math.round(quantity * 1000) / 1000,
      })),
    };
  });
}

/** Retire des besoins ce qui est déjà en stock ; un besoin couvert disparaît. */
export async function deductStock(
  db: Database,
  userId: string,
  needs: ShoppingNeed[],
): Promise<ShoppingNeed[]> {
  const stock = await availableStock(
    db,
    userId,
    needs.map((n) => n.ingredientId),
  );
  return needs.flatMap((need) => {
    const available = stock.get(stockKey(need.ingredientId, need.quantity.dimension)) ?? 0;
    const value = Math.round((need.quantity.value - available) * 1000) / 1000;
    return value > 0 ? [{ ...need, quantity: { dimension: need.quantity.dimension, value } }] : [];
  });
}

/** Crée une liste de courses à partir de recettes (ou d'un menu), stock déduit. */
export async function createShoppingList(
  db: Database,
  userId: string,
  input: { name: string; source: "recipes" | "menu"; entries: readonly ShoppingEntry[] },
): Promise<string | null> {
  const needs = await deductStock(db, userId, await buildShoppingNeeds(db, userId, input.entries));
  if (needs.length === 0) return null;
  return db.transaction(async (tx) => {
    const [list] = await tx
      .insert(s.shoppingLists)
      .values({
        ownerId: userId,
        name: input.name.trim().slice(0, 120) || "Liste de courses",
        source: input.source,
      })
      .returning({ id: s.shoppingLists.id });
    await tx.insert(s.shoppingListItems).values(
      needs.map((need) => ({
        shoppingListId: list!.id,
        ingredientId: need.ingredientId,
        quantityG: need.quantity.dimension === "mass" ? need.quantity.value.toFixed(3) : null,
        quantityMl: need.quantity.dimension === "volume" ? need.quantity.value.toFixed(3) : null,
        quantityPiece: need.quantity.dimension === "count" ? need.quantity.value.toFixed(2) : null,
        sources: need.sources,
      })),
    );
    return list!.id;
  });
}

export async function listShoppingLists(db: Database, userId: string) {
  const lists = await db
    .select()
    .from(s.shoppingLists)
    .where(eq(s.shoppingLists.ownerId, userId))
    .orderBy(desc(s.shoppingLists.createdAt));
  if (lists.length === 0) return [];
  const items = await db
    .select({ listId: s.shoppingListItems.shoppingListId, checked: s.shoppingListItems.checked })
    .from(s.shoppingListItems)
    .where(
      inArray(
        s.shoppingListItems.shoppingListId,
        lists.map((l) => l.id),
      ),
    );
  return lists.map((list) => {
    const own = items.filter((i) => i.listId === list.id);
    return {
      id: list.id,
      name: list.name,
      source: list.source,
      createdAt: list.createdAt.toISOString(),
      itemCount: own.length,
      checkedCount: own.filter((i) => i.checked).length,
    };
  });
}

export interface ShoppingListItemView {
  id: string;
  ingredientId: string;
  name: string;
  quantity: BaseQuantity;
  checked: boolean;
  /** Coût estimé avec le prix actuel (null : pas de prix ou conversion impossible). */
  costCents: number | null;
  estimated: boolean;
  recipes: string[];
}

export interface ShoppingListView {
  id: string;
  name: string;
  createdAt: string;
  groups: Array<{ code: string | null; label: string | null; items: ShoppingListItemView[] }>;
  totalCents: number;
  unpricedCount: number;
}

const DIMENSION_OF_UNIT = { g: "mass", ml: "volume", piece: "count" } as const;

export async function loadShoppingList(
  db: Database,
  userId: string,
  listId: string,
  languageCode = "fr",
): Promise<ShoppingListView | null> {
  const [list] = await db
    .select()
    .from(s.shoppingLists)
    .where(and(eq(s.shoppingLists.id, listId), eq(s.shoppingLists.ownerId, userId)));
  if (!list) return null;
  const rows = await db
    .select({
      id: s.shoppingListItems.id,
      ingredientId: s.shoppingListItems.ingredientId,
      g: s.shoppingListItems.quantityG,
      ml: s.shoppingListItems.quantityMl,
      piece: s.shoppingListItems.quantityPiece,
      checked: s.shoppingListItems.checked,
      sources: s.shoppingListItems.sources,
      canonicalName: s.ingredients.canonicalName,
      translated: s.ingredientTranslations.name,
      referenceUnit: s.ingredients.referenceUnit,
      density: s.ingredients.densityGPerMl,
      pieceWeight: s.ingredients.pieceWeightG,
      categoryCode: s.ingredientCategories.code,
      categoryOrder: s.ingredientCategories.sortOrder,
      categoryLabel: s.ingredientCategoryTranslations.name,
    })
    .from(s.shoppingListItems)
    .innerJoin(s.ingredients, eq(s.ingredients.id, s.shoppingListItems.ingredientId))
    .leftJoin(
      s.ingredientTranslations,
      and(
        eq(s.ingredientTranslations.ingredientId, s.ingredients.id),
        eq(s.ingredientTranslations.languageCode, languageCode),
      ),
    )
    .leftJoin(s.ingredientCategories, eq(s.ingredientCategories.id, s.ingredients.categoryId))
    .leftJoin(
      s.ingredientCategoryTranslations,
      and(
        eq(s.ingredientCategoryTranslations.categoryId, s.ingredientCategories.id),
        eq(s.ingredientCategoryTranslations.languageCode, languageCode),
      ),
    )
    .where(eq(s.shoppingListItems.shoppingListId, listId))
    .orderBy(asc(s.ingredientCategories.sortOrder), asc(s.ingredients.canonicalName));

  const prices = await currentPrices(
    db,
    userId,
    rows.map((r) => r.ingredientId),
  );
  const recipeIds = [...new Set(rows.flatMap((r) => (r.sources ?? []).map((src) => src.recipeId)))];
  const names = recipeIds.length
    ? await db
        .select({ id: s.recipes.id, name: s.recipeVersions.name })
        .from(s.recipes)
        .innerJoin(s.recipeVersions, eq(s.recipeVersions.id, s.recipes.currentVersionId))
        .where(and(inArray(s.recipes.id, recipeIds), eq(s.recipes.ownerId, userId)))
    : [];

  const groups: ShoppingListView["groups"] = [];
  let totalCents = 0;
  let unpricedCount = 0;
  for (const row of rows) {
    const quantity: BaseQuantity =
      row.g !== null
        ? { dimension: "mass", value: Number(row.g) }
        : row.ml !== null
          ? { dimension: "volume", value: Number(row.ml) }
          : { dimension: "count", value: Number(row.piece ?? 0) };
    const price = prices.get(row.ingredientId);
    let costCents: number | null = null;
    if (price) {
      const line: CostLine = {
        quantity,
        price: { dimension: DIMENSION_OF_UNIT[row.referenceUnit], amount: parsePrice(price.price) },
        ...(row.density !== null ? { densityGramsPerMl: Number(row.density) } : {}),
        ...(row.pieceWeight !== null ? { pieceWeightGrams: Number(row.pieceWeight) } : {}),
      };
      try {
        costCents = materialCost([line], 1).totalCents;
      } catch {
        costCents = null;
      }
    }
    if (costCents === null) unpricedCount += 1;
    else totalCents += costCents;
    const item: ShoppingListItemView = {
      id: row.id,
      ingredientId: row.ingredientId,
      name: row.translated ?? row.canonicalName,
      quantity,
      checked: row.checked,
      costCents,
      estimated: price?.estimated ?? false,
      recipes: (row.sources ?? []).flatMap((src) => names.find((n) => n.id === src.recipeId)?.name ?? []),
    };
    const code = row.categoryCode ?? null;
    let group = groups.find((g) => g.code === code);
    if (!group) {
      group = { code, label: row.categoryLabel ?? null, items: [] };
      groups.push(group);
    }
    group.items.push(item);
  }
  // Les articles sans rayon en dernier.
  groups.sort((a, b) => (a.code === null ? 1 : 0) - (b.code === null ? 1 : 0));
  return {
    id: list.id,
    name: list.name,
    createdAt: list.createdAt.toISOString(),
    groups,
    totalCents,
    unpricedCount,
  };
}

export async function setShoppingItemChecked(
  db: Database,
  userId: string,
  itemId: string,
  checked: boolean,
): Promise<boolean> {
  const [item] = await db
    .select({ id: s.shoppingListItems.id })
    .from(s.shoppingListItems)
    .innerJoin(s.shoppingLists, eq(s.shoppingLists.id, s.shoppingListItems.shoppingListId))
    .where(and(eq(s.shoppingListItems.id, itemId), eq(s.shoppingLists.ownerId, userId)));
  if (!item) return false;
  await db.update(s.shoppingListItems).set({ checked }).where(eq(s.shoppingListItems.id, itemId));
  return true;
}

export async function deleteShoppingList(db: Database, userId: string, listId: string): Promise<boolean> {
  const deleted = await db
    .delete(s.shoppingLists)
    .where(and(eq(s.shoppingLists.id, listId), eq(s.shoppingLists.ownerId, userId)))
    .returning({ id: s.shoppingLists.id });
  return deleted.length > 0;
}
