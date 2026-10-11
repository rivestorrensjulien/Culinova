import { describe, expect, it } from "vitest";
import { fakeBase } from "../fake";
import {
  BASE_PROMPT_VERSION,
  baseProblems,
  baseToRecipe,
  buildBasePrompt,
  generatedBaseSchema,
} from "./base";

const request = {
  name: "Pains bao",
  neededG: 400,
  neededDisplay: { quantity: 8, unit: "pains" },
  recipe: { name: "Bao au porc laqué", description: "Des bao moelleux.", cuisine: "Taïwanaise" },
  language: "fr" as const,
};

describe("recette de base faite maison", () => {
  it("transmet la préparation et la quantité nécessaire", () => {
    const { user } = buildBasePrompt(request);
    expect(BASE_PROMPT_VERSION).toBe("base.generate@3");
    expect(user).toContain("Préparation : Pains bao");
    expect(user).toContain("Quantité nécessaire : 400 g (8 pains)");
    expect(user).toContain("Recette principale : « Bao au porc laqué »");
    expect(user).toContain("entre 400 g et 800 g");
  });

  it("vérifie que la fournée couvre le besoin, sans excès", () => {
    const base = generatedBaseSchema.parse(fakeBase(buildBasePrompt(request).user));
    expect(base.name).toBe("Pains bao maison");
    expect(base.yieldG).toBe(400);
    expect(baseProblems(base, 400)).toEqual([]);
    expect(baseProblems({ ...base, yieldG: 300 }, 400)).toEqual([
      expect.stringContaining("ne couvre pas la quantité nécessaire"),
    ]);
    expect(baseProblems({ ...base, yieldG: 900 }, 400)).toEqual([expect.stringContaining("trop élevé")]);
    // Un très petit besoin (4 g) peut donner une petite fournée réaliste.
    expect(baseProblems({ ...base, yieldG: 150 }, 4)).toEqual([]);
    // Mêmes contrôles de complétude qu'une recette.
    expect(baseProblems({ ...base, storage: "" }, 400)).toEqual([
      expect.stringContaining("storage est vide"),
    ]);
    const recipe = baseToRecipe(base, "Taïwanaise");
    expect(recipe).toMatchObject({ servings: 1, cuisineLabel: "Taïwanaise", season: [], diets: [] });
    expect(recipe.ingredients[0]).toMatchObject({ unit: "g", storeBought: false, optional: false });
    expect(recipe.plating.description).toBe(base.storage);
    expect(baseToRecipe({ ...base, allergens: ["gluten", "inconnu"] }).allergens).toEqual(["gluten"]);
  });
});
