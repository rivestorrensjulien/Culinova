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
      ingredients: [
        ...recipe.ingredients,
        { ...recipe.ingredients[0]!, quantity: 0 },
        { ...recipe.ingredients[1]!, ref: "i50", unit: "ml" as const },
      ],
      steps: [
        ...recipe.steps,
        { ...recipe.steps[0]!, ingredientRefs: ["i99"], action: "Ajouter {{i42:10}} au bol." },
      ],
    };
    const problems = recipeProblems(broken, 4);
    expect(problems).toEqual(
      expect.arrayContaining([
        expect.stringContaining("servings doit valoir 4"),
        expect.stringContaining("en double : i1"),
        expect.stringContaining("Quantité invalide"),
        expect.stringContaining("doit être pesé en grammes"),
        expect.stringContaining("ingrédient inconnu : i99"),
        expect.stringContaining("jeton de quantité inconnu : {{i42:10}}"),
        expect.stringContaining("prepTimeSeconds"),
      ]),
    );
    // Recette incomplète (étapes vides, dressage vide, ingrédients inutilisés) : renvoyée au modèle.
    const truncated = {
      ...recipe,
      steps: [recipe.steps[0]!, { ...recipe.steps[1]!, action: "", ingredientRefs: [] }],
      plating: { ...recipe.plating, description: "." },
    };
    expect(recipeProblems(truncated, 4)).toEqual(
      expect.arrayContaining([
        expect.stringContaining("au moins 3 étapes"),
        expect.stringContaining("L'étape 2 est vide"),
        expect.stringContaining("plating.description est vide"),
        expect.stringContaining("Ingrédients jamais utilisés dans les étapes"),
      ]),
    );
    expect(recipeProblems({ ...recipe, ingredients: [], steps: [] }, 4)).toEqual(
      expect.arrayContaining(["La liste des ingrédients est vide.", "La liste des étapes est vide."]),
    );
  });
});
