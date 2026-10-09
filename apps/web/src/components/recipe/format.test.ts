import { describe, expect, it } from "vitest";
import { ingredientAmount, platingText } from "./format";

const grams = (
  quantity: number,
  displayQuantity: number | null = null,
  displayUnit: string | null = null,
) => ({
  dimension: "mass" as const,
  quantity,
  displayQuantity,
  displayUnit,
});

describe("quantités affichées", () => {
  it("affiche toujours les grammes d'abord", () => {
    expect(ingredientAmount(grams(115), null, 4, 4)).toEqual({ value: 115, unit: "g", kitchen: null });
    expect(ingredientAmount(grams(1200), null, 4, 4)).toMatchObject({ value: 1200, unit: "g" });
  });

  it("ajoute la mesure parlante entre parenthèses, recalculée", () => {
    expect(ingredientAmount(grams(165, 3, "œufs"), null, 4, 8)).toEqual({
      value: 330,
      unit: "g",
      kitchen: { value: 6, unit: "œufs" },
    });
    expect(ingredientAmount(grams(1, 1, "pincée"), null, 4, 6)).toEqual({
      value: 1.5,
      unit: "g",
      kitchen: { value: 1.5, unit: "pincée" },
    });
  });

  it("garde les demi-pièces : 4,5 œufs = 225 g", () => {
    expect(ingredientAmount(grams(150, 3, "œufs"), null, 4, 6)).toEqual({
      value: 225,
      unit: "g",
      kitchen: { value: 4.5, unit: "œufs" },
    });
  });

  it("calcule une partie de l'ingrédient pour les étapes", () => {
    expect(ingredientAmount(grams(75), 50, 4, 6)).toMatchObject({ value: 75, unit: "g" });
    expect(ingredientAmount(grams(165, 3, "œufs"), 55, 4, 4).kitchen).toEqual({ value: 1, unit: "œufs" });
  });

  it("garde l'unité des anciennes recettes en millilitres", () => {
    expect(
      ingredientAmount(
        { dimension: "volume", quantity: 300, displayQuantity: null, displayUnit: null },
        null,
        4,
        4,
      ),
    ).toEqual({ value: 30, unit: "cl", kitchen: null });
  });
});

describe("dressage", () => {
  const fields = {
    plate: "assiette plate blanche",
    positioning: "une part au centre",
    quantities: "1 part",
    sauce: null,
    garnish: null,
    finish: "voile de cacao.",
    decoration: null,
  };

  it("affiche la description rédigée", () => {
    expect(platingText({ ...fields, description: "Dans une assiette ronde, déposez une part." })).toBe(
      "Dans une assiette ronde, déposez une part.",
    );
  });

  it("reconstitue des phrases pour les anciennes recettes", () => {
    expect(platingText(fields)).toBe("Assiette plate blanche. Une part au centre. Voile de cacao.");
  });
});
