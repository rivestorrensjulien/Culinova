import { describe, expect, it } from "vitest";
import { fakeRecipe } from "./fake";
import { generatedRecipeSchema, recipeProblems, socialContentSchema } from "./schemas";
import { fakeSocial } from "./fake";

const user = "Langue de la recette : français\nNombre de personnes : 4";

describe("schéma de recette", () => {
  it("accepte une recette complète", () => {
    const recipe = generatedRecipeSchema.parse(fakeRecipe(user));
    expect(recipeProblems(recipe, 4)).toEqual([]);
    expect(socialContentSchema.safeParse(fakeSocial(user)).success).toBe(true);
  });

  it("rejette une unité non interne", () => {
    const recipe = fakeRecipe(user);
    const bad = { ...recipe, ingredients: [{ ...recipe.ingredients[0]!, unit: "l" }] };
    expect(generatedRecipeSchema.safeParse(bad).success).toBe(false);
  });

  it("détecte les incohérences métier", () => {
    const recipe = fakeRecipe(user);
    const broken = {
      ...recipe,
      servings: 6,
      prepTimeSeconds: -5,
      ingredients: [...recipe.ingredients, { ...recipe.ingredients[0]!, quantity: 0 }],
      steps: [...recipe.steps, { ...recipe.steps[0]!, ingredientRefs: ["i99"] }],
    };
    const problems = recipeProblems(broken, 4);
    expect(problems).toEqual(
      expect.arrayContaining([
        expect.stringContaining("servings doit valoir 4"),
        expect.stringContaining("en double : i1"),
        expect.stringContaining("Quantité invalide"),
        expect.stringContaining("ingrédient inconnu : i99"),
        expect.stringContaining("prepTimeSeconds"),
      ]),
    );
    expect(recipeProblems({ ...recipe, ingredients: [], steps: [] }, 4)).toEqual(
      expect.arrayContaining(["La liste des ingrédients est vide.", "La liste des étapes est vide."]),
    );
  });
});
