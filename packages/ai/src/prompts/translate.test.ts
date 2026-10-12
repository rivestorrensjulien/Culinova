import { describe, expect, it } from "vitest";
import { fakeRecipe, fakeTranslation } from "../fake";
import {
  buildTranslatePrompt,
  TRANSLATE_PROMPT_VERSION,
  translationProblems,
  translationSchema,
} from "./translate";

const recipe = fakeRecipe("Nombre de personnes : 4");

describe("traduction culinaire", () => {
  it("transmet la recette avec ses jetons et la langue cible", () => {
    const { system, user } = buildTranslatePrompt(recipe, "en");
    expect(TRANSLATE_PROMPT_VERSION).toBe("recipe.translate@1");
    expect(system).toContain("pas littérale");
    expect(user).toContain("Langue cible : anglais (English)");
    expect(user).toContain("Cuire le riz {{i1}} avec l'eau {{i2}}");
  });

  it("refuse une traduction qui perd un jeton, une étape ou un ingrédient", () => {
    const good = translationSchema.parse(fakeTranslation(buildTranslatePrompt(recipe, "en").user));
    expect(translationProblems(good, recipe)).toEqual([]);
    const lost = {
      ...good,
      steps: good.steps.map((s, i) => (i === 1 ? { ...s, action: "Cook the rice." } : s)),
    };
    expect(translationProblems(lost, recipe)).toEqual([
      "Étape 2 : garde exactement les jetons de quantité de l'original.",
    ]);
    expect(
      translationProblems(
        { ...good, steps: good.steps.slice(1), ingredients: good.ingredients.slice(1) },
        recipe,
      ),
    ).toEqual([
      expect.stringContaining("ingredients doit reprendre"),
      expect.stringContaining("steps doit compter"),
    ]);
  });
});
