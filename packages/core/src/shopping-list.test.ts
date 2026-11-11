import { describe, expect, it } from "vitest";
import { isPantryStaple, isTapWater, mergeShoppingItems } from "./shopping-list";

describe("liste de courses", () => {
  it("additionne un même ingrédient (200 g + 300 g = 500 g)", () => {
    expect(
      mergeShoppingItems([
        { ingredientId: "farine", quantity: 200, unit: "g" },
        { ingredientId: "farine", quantity: 300, unit: "g" },
      ]),
    ).toEqual([{ ingredientId: "farine", quantity: { dimension: "mass", value: 500 } }]);
  });

  it("additionne des unités différentes d'une même dimension", () => {
    const [lait] = mergeShoppingItems([
      { ingredientId: "lait", quantity: 50, unit: "cl" },
      { ingredientId: "lait", quantity: 1, unit: "l" },
    ]);
    expect(lait?.quantity).toEqual({ dimension: "volume", value: 1500 });
  });

  it("garde séparées les dimensions différentes et l'ordre d'apparition", () => {
    const result = mergeShoppingItems([
      { ingredientId: "oeuf", quantity: 2, unit: "piece" },
      { ingredientId: "sucre", quantity: 100, unit: "g" },
      { ingredientId: "oeuf", quantity: 50, unit: "g" },
      { ingredientId: "oeuf", quantity: 1, unit: "piece" },
    ]);
    expect(result).toEqual([
      { ingredientId: "oeuf", quantity: { dimension: "count", value: 3 } },
      { ingredientId: "sucre", quantity: { dimension: "mass", value: 100 } },
      { ingredientId: "oeuf", quantity: { dimension: "mass", value: 50 } },
    ]);
  });

  it("renvoie une liste vide sans ingrédient", () => {
    expect(mergeShoppingItems([])).toEqual([]);
  });
});

describe("basiques du placard", () => {
  it("reconnaît sel, poivre, huile, épices et eau, pas les produits frais", () => {
    for (const name of [
      "Sel fin",
      "Poivre noir moulu",
      "Huile d'olive",
      "Sucre en poudre",
      "Farine de blé T55",
      "Cumin en poudre",
      "Eau",
      "Levure chimique",
      "Moutarde de Dijon",
    ]) {
      expect(isPantryStaple(name), name).toBe(true);
    }
    for (const name of [
      "Poivrons rouges",
      "Saumon",
      "Sucre glace décoratif à la rose",
      "Eau de fleur d'oranger",
      "Farine de pois chiches bio aux herbes",
      "Crème fraîche",
    ]) {
      expect(isPantryStaple(name), name).toBe(false);
    }
    expect(isTapWater("Eau")).toBe(true);
    expect(isTapWater("Eau de coco")).toBe(false);
  });
});
