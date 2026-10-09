import { describe, expect, it } from "vitest";
import { fakeRecipe } from "../fake";
import { buildRecipePrompt, buildRegenerationPrompt, RECIPE_PROMPT_VERSION } from "./recipe";
import { isFusion, type RecipeRequest } from "./request";
import { buildSocialPrompt } from "./social";

const japanese = {
  label: "Japonaise",
  country: "Japon",
  region: "Asie de l'Est",
  description: "Cuisine de saison et d'umami.",
  signatureIngredients: ["dashi", "miso"],
  techniques: ["tempura"],
  spices: ["sansho"],
  referenceDishes: ["ramen"],
};

const request: RecipeRequest = {
  moment: "Plat",
  influence: "Asie",
  region: "Asie de l'Est",
  country: "Japon",
  cuisines: [japanese],
  style: { code: "creative", label: "Interprétation créative", description: "Une relecture libre." },
  language: "fr",
  mode: "idea",
  input: "Un plat réconfortant au saumon",
  servings: 6,
  constraints: { diets: ["lactose_free"], allergens: ["peanuts"], dislikedIngredients: ["coriandre"] },
};

describe("prompt de recette", () => {
  it("transmet tous les paramètres de création au moteur", () => {
    const { system, user } = buildRecipePrompt(request);
    expect(RECIPE_PROMPT_VERSION).toBe("recipe.generate@3");
    expect(system).toContain("fusionLabel");
    for (const expected of [
      "Moment de consommation : Plat",
      "Influence culinaire : Asie",
      "Région : Asie de l'Est",
      "Pays : Japon",
      "- Japonaise (Japon, Asie de l'Est)",
      "Ingrédients caractéristiques : dashi, miso",
      "Techniques : tempura",
      "Épices et aromates : sansho",
      "Plats de référence : ramen",
      "Style : Interprétation créative — Une relecture libre.",
      "Langue de la recette : français",
      "Mode de création : à partir d'une idée",
      "Un plat réconfortant au saumon",
      "Nombre de personnes : 6",
      "Régimes à respecter : lactose_free",
      "Allergènes à exclure : peanuts",
      "Ingrédients à éviter : coriandre",
    ]) {
      expect(user).toContain(expected);
    }
    expect(user).not.toContain("fusion, à signaler");
  });

  it("signale une fusion quand plusieurs cuisines sont choisies", () => {
    const fusion = {
      ...request,
      cuisines: [japanese, { ...japanese, label: "Française", country: "France" }],
    };
    expect(isFusion(fusion)).toBe(true);
    expect(buildRecipePrompt(fusion).user).toContain("Cuisines à fusionner :");
    expect(buildRecipePrompt(fusion).user).toContain("c'est une fusion");
  });

  it("indique « aucune » influence et l'anglais", () => {
    const { user } = buildRecipePrompt({
      ...request,
      influence: null,
      region: null,
      country: null,
      cuisines: [],
      language: "en",
    });
    expect(user).toContain("Influence culinaire : aucune");
    expect(user).toContain("Langue de la recette : anglais");
    expect(user).not.toContain("Pays :");
  });

  it("régénère avec ou sans consigne", () => {
    const previous = { name: "Saumon laqué", description: "…" };
    expect(buildRegenerationPrompt(request, previous).user).toContain("nettement différente");
    expect(buildRegenerationPrompt(request, previous, "Remplace le saumon par du tofu").user).toContain(
      "Remplace le saumon par du tofu",
    );
  });

  it("construit le prompt du contenu social à partir de la recette", () => {
    const recipe = fakeRecipe("Nombre de personnes : 4");
    const { user } = buildSocialPrompt(recipe, "en");
    expect(user).toContain("anglais");
    expect(user).toContain(recipe.name);
  });
});
