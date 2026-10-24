import { describe, expect, it } from "vitest";
import { fakeRecipe, fakeSocial } from "../fake";
import {
  buildEditPrompt,
  buildRecipePrompt,
  buildRegenerationPrompt,
  RECIPE_EDIT_PROMPT_VERSION,
  RECIPE_PROMPT_VERSION,
} from "./recipe";
import { isFusion, type RecipeRequest } from "./request";
import { buildSocialPrompt, socialProblems } from "./social";

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
    expect(RECIPE_PROMPT_VERSION).toBe("recipe.generate@11");
    expect(system).toContain("fusionLabel");
    // Contenant de service adapté au moment de consommation, sans assiette ronde par défaut.
    expect(system).toContain("street food → barquette");
    expect(system).not.toContain("assiette ronde (21");
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

  it("modifie la recette actuelle selon la consigne, sans repartir de zéro", () => {
    const current = fakeRecipe("Nombre de personnes : 6");
    const { user } = buildEditPrompt(request, current, "  Remplace le saumon par du tofu ");
    expect(RECIPE_EDIT_PROMPT_VERSION).toBe("recipe.edit@1");
    expect(user).toContain('"""\nRemplace le saumon par du tofu\n"""');
    expect(user).toContain(JSON.stringify(current));
    expect(user).toContain("servings = 6");
    expect(user).toContain("Ne change que ce que la consigne demande");
  });

  it("construit le prompt du contenu social à partir de la recette", () => {
    const recipe = fakeRecipe("Nombre de personnes : 4");
    const { user } = buildSocialPrompt(recipe, "en");
    expect(user).toContain("anglais");
    expect(user).toContain(recipe.name);
    // Les étapes réelles sont transmises, jetons de quantité remplacés par le poids.
    expect(user).toContain("Cuire le riz 300 g avec l'eau 360 g");
    expect(user).not.toContain("{{");
  });

  it("demande un script TikTok structuré, sans nombre d'ingrédients", () => {
    const { system } = buildSocialPrompt(fakeRecipe("Nombre de personnes : 4"), "fr");
    expect(system).toContain("une ligne par scène");
    expect(system).toContain("commence par un verbe à l'infinitif");
    expect(system).toContain("aucune répétition ni redondance");
    expect(system).toContain("Ne donne jamais de nombre d'ingrédients");
  });

  it("vérifie la structure du script TikTok", () => {
    expect(socialProblems(fakeSocial("français"))).toEqual([]);
    expect(
      socialProblems({ tiktok: "Accroche (0-3 s) : Miam\nPlan 1 : Couper\nPlan 2 : Cuire\nFinal : Dresser" }),
    ).toEqual([expect.stringContaining("ligne 4 : attendu « Plan 3 : »")]);
    expect(socialProblems({ tiktok: "Plan 1 : Couper\nPlan 2 : Cuire" })).toEqual([
      expect.stringContaining("Accroche"),
      expect.stringContaining("ligne 2 : attendu « Plan 1 : »"),
      expect.stringContaining("au moins deux plans"),
    ]);
  });
});
