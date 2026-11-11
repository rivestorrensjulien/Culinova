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

/**
 * Basiques du placard (sel, poivre, huile, sucre, farine, épices sèches…) : dans la liste d'un
 * particulier, ils sont rangés à part, « Sûrement déjà dans vos placards », plutôt que mêlés aux
 * courses. L'eau du robinet n'est jamais à acheter.
 */
const STAPLE_PATTERN = new RegExp(
  [
    "^sel\\b",
    "fleur de sel",
    "^poivre\\b(?! (rouge|vert|jaune)s?$)",
    "^huile\\b",
    "^vinaigre\\b",
    "^sucre( (en poudre|semoule|blanc|roux|cassonade))?$",
    "^cassonade$",
    "^farine( de blé)?( t\\d+)?$",
    "^levure chimique",
    "^bicarbonate",
    "^maïzena|^fécule de maïs",
    "^moutarde\\b",
    "^(cumin|paprika|curcuma|cannelle|muscade|noix de muscade|curry|gingembre en poudre|piment d'espelette|herbes de provence|origan séché|thym séché|laurier|clou de girofle|quatre-épices|piment en poudre|ras el-hanout)\\b",
    "^extrait de vanille|^arôme vanille",
    "^bouillon\\b.*\\b(cube|tablette)",
  ].join("|"),
  "i",
);
const TAP_WATER = /^eau( (du robinet|froide|chaude|tiède|bouillante))?$/i;

export function isPantryStaple(name: string): boolean {
  const label = name.trim().toLowerCase();
  return TAP_WATER.test(label) || STAPLE_PATTERN.test(label);
}

export function isTapWater(name: string): boolean {
  return TAP_WATER.test(name.trim().toLowerCase());
}
