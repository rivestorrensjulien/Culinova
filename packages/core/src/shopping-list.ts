/**
 * Liste de courses : fusion des ingrédients de plusieurs recettes
 * (200 g + 300 g de farine = 500 g ; 50 cl + 1 l de lait = 1 500 ml).
 */
import { type BaseQuantity, type Dimension, toBase, type Unit } from "./units";

export interface ShoppingItemInput {
  ingredientId: string;
  quantity: number;
  unit: Unit;
}

export interface ShoppingItem {
  ingredientId: string;
  quantity: BaseQuantity;
}

/**
 * Additionne les quantités d'un même ingrédient. Des dimensions différentes
 * (ex. œufs à la pièce et œufs en grammes) restent sur des lignes séparées.
 * L'ordre de première apparition est conservé.
 */
export function mergeShoppingItems(items: readonly ShoppingItemInput[]): ShoppingItem[] {
  const merged = new Map<string, ShoppingItem>();
  for (const item of items) {
    const base = toBase(item.quantity, item.unit);
    const key = `${item.ingredientId}\u0000${base.dimension satisfies Dimension}`;
    const existing = merged.get(key);
    if (existing) {
      existing.quantity = { dimension: base.dimension, value: existing.quantity.value + base.value };
    } else {
      merged.set(key, { ingredientId: item.ingredientId, quantity: base });
    }
  }
  return [...merged.values()];
}
