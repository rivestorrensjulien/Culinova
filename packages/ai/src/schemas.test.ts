import { describe, expect, it } from "vitest";
import { generatedRecipeSchema } from "./schemas";

const valid = {
  name: "Velouté de potimarron",
  servings: 4,
  difficulty: "easy",
  prepTimeSeconds: 900,
  cookTimeSeconds: 1800,
  equipment: ["casserole", "mixeur"],
  ingredients: [{ name: "potimarron", quantity: 800, unit: "g" }],
  steps: [{ order: 1, action: "Couper le potimarron en cubes." }],
  plating: { plate: "assiette creuse", arrangement: "au centre" },
};

describe("schéma de recette", () => {
  it("accepte une recette valide et complète les valeurs par défaut", () => {
    const recipe = generatedRecipeSchema.parse(valid);
    expect(recipe.steps[0]?.equipment).toEqual([]);
  });

  it("rejette une recette sans ingrédient ou avec une unité non interne", () => {
    expect(generatedRecipeSchema.safeParse({ ...valid, ingredients: [] }).success).toBe(false);
    expect(
      generatedRecipeSchema.safeParse({ ...valid, ingredients: [{ name: "lait", quantity: 1, unit: "l" }] })
        .success,
    ).toBe(false);
  });
});
