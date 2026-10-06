import { describe, expect, it } from "vitest";
import { mergeShoppingItems } from "./shopping-list";

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
