/**
 * Stocks : ce que la personne a en réserve, en unités internes (g, ml, pièces).
 * Le seuil d'alerte (`min_quantity_g`) est exprimé dans l'unité de l'article
 * (grammes, millilitres ou pièces). Les courses cochées peuvent y être rangées,
 * le stock est déduit des nouvelles listes et une préparation peut le consommer.
 */
import type { BaseQuantity, Dimension } from "@culinova/core";
import type { Database } from "@culinova/db";
import * as s from "@culinova/db/schema";
import { and, asc, eq, inArray, isNull, or } from "drizzle-orm";

export interface StockItemView {
  id: string;
  ingredientId: string;
  name: string;
  quantity: BaseQuantity;
  min: number | null;
  bestBefore: string | null;
  low: boolean;
  /** Date limite dépassée ou dans les 3 jours. */
  expiring: "expired" | "soon" | null;
}

const DAY_MS = 86_400_000;

function quantityOf(row: { g: string | null; ml: string | null; piece: string | null }): BaseQuantity {
  if (row.ml !== null) return { dimension: "volume", value: Number(row.ml) };
  if (row.piece !== null) return { dimension: "count", value: Number(row.piece) };
  return { dimension: "mass", value: Number(row.g ?? 0) };
}

function columnsFor(quantity: BaseQuantity) {
  const value = Math.max(0, quantity.value);
  return {
    quantityG: quantity.dimension === "mass" ? value.toFixed(3) : null,
    quantityMl: quantity.dimension === "volume" ? value.toFixed(3) : null,
    quantityPiece: quantity.dimension === "count" ? value.toFixed(2) : null,
  };
}

export async function listStock(
  db: Database,
  userId: string,
  languageCode = "fr",
  now = new Date(),
): Promise<StockItemView[]> {
  const rows = await db
    .select({
      id: s.inventoryItems.id,
      ingredientId: s.inventoryItems.ingredientId,
      g: s.inventoryItems.quantityG,
      ml: s.inventoryItems.quantityMl,
      piece: s.inventoryItems.quantityPiece,
      min: s.inventoryItems.minQuantityG,
      bestBefore: s.inventoryItems.bestBefore,
      canonicalName: s.ingredients.canonicalName,
      translated: s.ingredientTranslations.name,
    })
    .from(s.inventoryItems)
    .innerJoin(s.ingredients, eq(s.ingredients.id, s.inventoryItems.ingredientId))
    .leftJoin(
      s.ingredientTranslations,
      and(
        eq(s.ingredientTranslations.ingredientId, s.ingredients.id),
        eq(s.ingredientTranslations.languageCode, languageCode),
      ),
    )
    .where(eq(s.inventoryItems.ownerId, userId))
    .orderBy(asc(s.ingredients.canonicalName));
  return rows.map((row) => {
    const quantity = quantityOf(row);
    const min = row.min === null ? null : Number(row.min);
    const days = row.bestBefore ? (row.bestBefore.getTime() - now.getTime()) / DAY_MS : null;
    return {
      id: row.id,
      ingredientId: row.ingredientId,
      name: row.translated ?? row.canonicalName,
      quantity,
      min,
      bestBefore: row.bestBefore?.toISOString() ?? null,
      low: min !== null && quantity.value <= min,
      expiring: days === null ? null : days < 0 ? "expired" : days <= 3 ? "soon" : null,
    };
  });
}

async function usableIngredient(db: Database, userId: string, ingredientId: string) {
  const [row] = await db
    .select({ id: s.ingredients.id, referenceUnit: s.ingredients.referenceUnit })
    .from(s.ingredients)
    .where(
      and(
        eq(s.ingredients.id, ingredientId),
        isNull(s.ingredients.deletedAt),
        or(eq(s.ingredients.scope, "global"), eq(s.ingredients.ownerId, userId)),
      ),
    );
  return row ?? null;
}

/** Ajoute une quantité au stock (fusionnée avec l'article existant de même nature). */
export async function addToStock(
  db: Database,
  userId: string,
  input: { ingredientId: string; quantity: BaseQuantity; bestBefore?: Date | null; min?: number | null },
): Promise<boolean> {
  if (!(input.quantity.value >= 0) || !(await usableIngredient(db, userId, input.ingredientId))) return false;
  const existing = (await listRaw(db, userId, [input.ingredientId])).find(
    (row) => quantityOf(row).dimension === input.quantity.dimension,
  );
  if (existing) {
    const current = quantityOf(existing);
    await db
      .update(s.inventoryItems)
      .set({
        ...columnsFor({ dimension: current.dimension, value: current.value + input.quantity.value }),
        purchasedAt: new Date(),
        ...(input.bestBefore !== undefined && input.bestBefore !== null
          ? { bestBefore: input.bestBefore }
          : {}),
        ...(input.min !== undefined && input.min !== null ? { minQuantityG: input.min.toFixed(3) } : {}),
      })
      .where(eq(s.inventoryItems.id, existing.id));
    return true;
  }
  await db.insert(s.inventoryItems).values({
    ownerId: userId,
    ingredientId: input.ingredientId,
    ...columnsFor(input.quantity),
    minQuantityG: input.min === undefined || input.min === null ? null : input.min.toFixed(3),
    bestBefore: input.bestBefore ?? null,
    purchasedAt: new Date(),
  });
  return true;
}

async function listRaw(db: Database, userId: string, ingredientIds: string[]) {
  if (ingredientIds.length === 0) return [];
  return db
    .select({
      id: s.inventoryItems.id,
      ingredientId: s.inventoryItems.ingredientId,
      g: s.inventoryItems.quantityG,
      ml: s.inventoryItems.quantityMl,
      piece: s.inventoryItems.quantityPiece,
    })
    .from(s.inventoryItems)
    .where(and(eq(s.inventoryItems.ownerId, userId), inArray(s.inventoryItems.ingredientId, ingredientIds)));
}

export async function updateStockItem(
  db: Database,
  userId: string,
  itemId: string,
  input: { value: number; min: number | null; bestBefore: Date | null },
): Promise<boolean> {
  const [item] = await db
    .select({
      g: s.inventoryItems.quantityG,
      ml: s.inventoryItems.quantityMl,
      piece: s.inventoryItems.quantityPiece,
    })
    .from(s.inventoryItems)
    .where(and(eq(s.inventoryItems.id, itemId), eq(s.inventoryItems.ownerId, userId)));
  if (!item || !(input.value >= 0)) return false;
  await db
    .update(s.inventoryItems)
    .set({
      ...columnsFor({ dimension: quantityOf(item).dimension, value: input.value }),
      minQuantityG: input.min === null ? null : input.min.toFixed(3),
      bestBefore: input.bestBefore,
    })
    .where(eq(s.inventoryItems.id, itemId));
  return true;
}

export async function removeStockItem(db: Database, userId: string, itemId: string): Promise<boolean> {
  const deleted = await db
    .delete(s.inventoryItems)
    .where(and(eq(s.inventoryItems.id, itemId), eq(s.inventoryItems.ownerId, userId)))
    .returning({ id: s.inventoryItems.id });
  return deleted.length > 0;
}

/** Quantités disponibles par ingrédient et par nature (masse, volume, pièces). */
export async function availableStock(
  db: Database,
  userId: string,
  ingredientIds: string[],
): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  for (const row of await listRaw(db, userId, ingredientIds)) {
    const quantity = quantityOf(row);
    const key = stockKey(row.ingredientId, quantity.dimension);
    map.set(key, (map.get(key) ?? 0) + quantity.value);
  }
  return map;
}

export function stockKey(ingredientId: string, dimension: Dimension): string {
  return `${ingredientId}:${dimension}`;
}

/** Retire du stock les quantités utilisées (jamais en dessous de zéro). Renvoie le nombre d'articles touchés. */
export async function consumeStock(
  db: Database,
  userId: string,
  needs: ReadonlyArray<{ ingredientId: string; quantity: BaseQuantity }>,
): Promise<number> {
  const rows = await listRaw(
    db,
    userId,
    needs.map((n) => n.ingredientId),
  );
  let touched = 0;
  for (const need of needs) {
    const row = rows.find(
      (r) => r.ingredientId === need.ingredientId && quantityOf(r).dimension === need.quantity.dimension,
    );
    if (!row) continue;
    const current = quantityOf(row);
    await db
      .update(s.inventoryItems)
      .set(
        columnsFor({ dimension: current.dimension, value: Math.max(0, current.value - need.quantity.value) }),
      )
      .where(eq(s.inventoryItems.id, row.id));
    touched += 1;
  }
  return touched;
}

/** Range dans le stock les articles cochés d'une liste de courses. */
export async function stockFromShoppingList(db: Database, userId: string, listId: string): Promise<number> {
  const items = await db
    .select({
      ingredientId: s.shoppingListItems.ingredientId,
      g: s.shoppingListItems.quantityG,
      ml: s.shoppingListItems.quantityMl,
      piece: s.shoppingListItems.quantityPiece,
    })
    .from(s.shoppingListItems)
    .innerJoin(s.shoppingLists, eq(s.shoppingLists.id, s.shoppingListItems.shoppingListId))
    .where(
      and(
        eq(s.shoppingListItems.shoppingListId, listId),
        eq(s.shoppingLists.ownerId, userId),
        eq(s.shoppingListItems.checked, true),
      ),
    );
  let count = 0;
  for (const item of items) {
    if (await addToStock(db, userId, { ingredientId: item.ingredientId, quantity: quantityOf(item) }))
      count += 1;
  }
  return count;
}
