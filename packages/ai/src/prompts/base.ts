/**
 * Préparations « faites maison » (« Mes bases ») : recette d'un élément
 * habituellement acheté tout prêt (pains bao, pâte feuilletée…), dimensionnée
 * pour couvrir le besoin de la recette principale.
 */
import { z } from "zod";
import { ALLERGEN_CODES, type GeneratedRecipe, recipeProblems } from "../schemas";
import { RECIPE_SYSTEM_PROMPT } from "./recipe";

export const BASE_PROMPT_VERSION = "base.generate@3";

/** Une base qui produit moins de 150 g est rarement réaliste : le surplus se conserve. */
export const BASE_MIN_REALISTIC_YIELD_G = 150;

/**
 * Schéma volontairement compact : la grammaire des sorties structurées a une taille
 * limitée, et une base n'a besoin ni de dressage détaillé, ni de saison, ni de groupes.
 * Elle est ensuite complétée en recette (toRecipe) pour être enregistrée comme les autres.
 */
export const generatedBaseSchema = z.object({
  name: z.string(),
  description: z.string(),
  difficulty: z.enum(["easy", "medium", "hard"]),
  prepTimeSeconds: z.number(),
  cookTimeSeconds: z.number(),
  restTimeSeconds: z.number(),
  equipment: z.array(z.string()),
  ingredients: z.array(
    z.object({
      ref: z.string(),
      name: z.string(),
      /** Poids en grammes. */
      quantity: z.number(),
      displayQuantity: z.number().nullable(),
      displayUnit: z.string().nullable(),
    }),
  ),
  steps: z.array(
    z.object({
      action: z.string(),
      ingredientRefs: z.array(z.string()),
      temperatureC: z.number().nullable(),
      durationSeconds: z.number().nullable(),
      expectedResult: z.string().nullable(),
    }),
  ),
  /** Conservation jusqu'à l'utilisation, en une ou deux phrases. */
  storage: z.string(),
  /** Allergènes réglementaires (codes anglais : gluten, eggs, milk…). */
  allergens: z.array(z.string()),
  tips: z.array(z.string()),
  /** Poids de préparation obtenu, en grammes. */
  yieldG: z.number(),
  /** Mesure parlante du rendement (8 pains, 2 pâtons…), facultative. */
  yieldDisplayQuantity: z.number().nullable(),
  yieldDisplayUnit: z.string().nullable(),
  /** Conservation au réfrigérateur, en heures (null si sans objet). */
  shelfLifeHours: z.number().nullable(),
});

export type GeneratedBase = z.infer<typeof generatedBaseSchema>;

const KNOWN_ALLERGENS = new Set<string>(ALLERGEN_CODES);

/** Complète une base en recette (une fournée « pour 1 ») pour l'enregistrer comme les autres. */
export function baseToRecipe(base: GeneratedBase, cuisine: string | null = null): GeneratedRecipe {
  return {
    name: base.name,
    description: base.description,
    servings: 1,
    difficulty: base.difficulty,
    prepTimeSeconds: Math.max(0, Math.round(base.prepTimeSeconds)),
    cookTimeSeconds: Math.max(0, Math.round(base.cookTimeSeconds)),
    restTimeSeconds: Math.max(0, Math.round(base.restTimeSeconds)),
    season: [],
    equipment: base.equipment,
    cuisineLabel: cuisine ?? "",
    fusionLabel: null,
    ingredients: base.ingredients.map((ingredient) => ({
      ...ingredient,
      unit: "g" as const,
      preparation: null,
      group: null,
      optional: false,
      storeBought: false,
    })),
    steps: base.steps.map((step) => ({
      ...step,
      phase: step.temperatureC !== null ? ("cooking" as const) : ("mise_en_place" as const),
      equipment: [],
      timer: (step.durationSeconds ?? 0) >= 60,
    })),
    plating: {
      description: base.storage,
      plate: "",
      positioning: "",
      quantities: "",
      sauce: null,
      garnish: null,
      finish: null,
      decoration: null,
    },
    allergens: base.allergens.filter((code): code is GeneratedRecipe["allergens"][number] =>
      KNOWN_ALLERGENS.has(code),
    ),
    diets: [],
    tips: base.tips,
  };
}

export interface BaseRequest {
  /** Nom de l'élément tel qu'écrit dans la recette principale (ex. « Pains bao »). */
  name: string;
  /** Besoin de la recette principale, en grammes. */
  neededG: number;
  /** Mesure parlante du besoin (8 pains), si connue. */
  neededDisplay: { quantity: number; unit: string } | null;
  recipe: { name: string; description: string | null; cuisine: string | null };
  language: "fr" | "en";
}

const LANGUAGE_NAMES = { fr: "français", en: "anglais (English)" } as const;

export function maxBaseYield(neededG: number): number {
  return Math.max(neededG * 2, BASE_MIN_REALISTIC_YIELD_G);
}

export function buildBasePrompt(request: BaseRequest): { system: string; user: string } {
  const need = request.neededDisplay
    ? `${request.neededG} g (${request.neededDisplay.quantity} ${request.neededDisplay.unit})`
    : `${request.neededG} g`;
  const context = [
    `Recette principale : « ${request.recipe.name} »${request.recipe.description ? ` — ${request.recipe.description}` : ""}`,
    request.recipe.cuisine ? `Cuisine : ${request.recipe.cuisine}` : null,
  ]
    .filter(Boolean)
    .join("\n");
  return {
    // Même texte fixe que les recettes (mis en cache) ; les règles propres aux bases sont ci-dessous.
    system: RECIPE_SYSTEM_PROMPT,
    user: `Rédige la recette maison d'une préparation de base, qui remplace un produit acheté tout prêt.

Préparation : ${request.name}
Quantité nécessaire : ${need}
${context}
Langue de la recette : ${LANGUAGE_NAMES[request.language]}

Règles propres à cette préparation de base (le format de sortie est simplifié, sans dressage ni nombre de personnes) :
- name : le nom de la préparation suivi de « maison » (ex. « Pains bao maison »).
- C'est une fournée, pas un plat servi : dimensionne-la pour produire au moins la quantité nécessaire. yieldG est le poids de préparation obtenu, en grammes, compris entre ${request.neededG} g et ${Math.round(maxBaseYield(request.neededG))} g. Arrondis à la pièce entière ou à une fournée réaliste ; si le besoin est très petit, produis une petite quantité réaliste (le surplus se conserve).
- yieldDisplayQuantity et yieldDisplayUnit : le nombre de pièces obtenues quand la préparation se compte (ex. 8 et « pains »), sinon null.
- Ingrédients pesés en grammes (quantity), avec la mesure parlante facultative ; les étapes citent les ingrédients par leurs références et écrivent les quantités en jetons {{i1}} / {{i1:50}}, comme pour une recette.
- Au moins 3 étapes ; chaque ingrédient sert dans une étape. temperatureC uniquement pour les étapes qui chauffent.
- Les temps (préparation, cuisson, repos, pousse) sont ceux de la préparation seule ; la pousse et le repos vont dans restTimeSeconds.
- storage : contenant et façon de réserver la préparation jusqu'à son utilisation, en une ou deux phrases (ex. « Réservez les pains sous un linge propre, dans le panier vapeur, jusqu'à la garniture. »).
- shelfLifeHours : durée de conservation au réfrigérateur, en heures (null si la préparation se fait au dernier moment).
- allergens : codes parmi gluten, crustaceans, eggs, fish, peanuts, soy, milk, nuts, celery, mustard, sesame, sulphites, lupin, molluscs.
- Le style, les saveurs et le vocabulaire s'accordent avec la recette principale.`,
  };
}

/** Règles métier d'une base : celles d'une recette, plus le rendement attendu. */
export function baseProblems(base: GeneratedBase, neededG: number): string[] {
  // Mêmes contrôles de complétude qu'une recette (étapes, jetons, ingrédients utilisés…).
  const problems = recipeProblems(baseToRecipe(base), 1).map((problem) =>
    problem.replace(
      /plating\.description est vide : raconte le dressage/,
      "storage est vide : décris la conservation",
    ),
  );
  if (!(base.yieldG >= neededG * 0.95)) {
    problems.push(`yieldG (${base.yieldG} g) ne couvre pas la quantité nécessaire (${neededG} g).`);
  } else if (base.yieldG > maxBaseYield(neededG)) {
    problems.push(
      `yieldG (${base.yieldG} g) est trop élevé : vise au plus ${Math.round(maxBaseYield(neededG))} g.`,
    );
  }
  if (base.shelfLifeHours !== null && base.shelfLifeHours < 0) problems.push("shelfLifeHours est négatif.");
  return problems;
}
