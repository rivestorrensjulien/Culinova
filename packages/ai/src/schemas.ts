/**
 * Schémas Zod des sorties de l'IA. Toute réponse est validée (schéma + règles
 * métier) avant d'entrer en base. Les champs facultatifs sont « nullables »
 * plutôt qu'absents, pour rester compatibles avec les sorties structurées.
 */
import { z } from "zod";

export const ALLERGEN_CODES = [
  "gluten",
  "crustaceans",
  "eggs",
  "fish",
  "peanuts",
  "soy",
  "milk",
  "nuts",
  "celery",
  "mustard",
  "sesame",
  "sulphites",
  "lupin",
  "molluscs",
] as const;

export const recipeIngredientSchema = z.object({
  /** Référence courte (« i1 », « i2 »…) utilisée par les étapes. */
  ref: z.string(),
  name: z.string(),
  /** Poids en grammes (« ml » et « piece » restent lisibles pour les anciennes recettes). */
  quantity: z.number(),
  unit: z.enum(["g", "ml", "piece"]),
  /** Mesure parlante facultative, affichée entre parenthèses (ex. 3 œufs, 1 pincée, 30 cl). */
  displayQuantity: z.number().nullable(),
  displayUnit: z.string().nullable(),
  preparation: z.string().nullable(),
  group: z.string().nullable(),
  optional: z.boolean(),
});

export const recipeStepSchema = z.object({
  phase: z.enum(["mise_en_place", "cooking", "plating"]),
  action: z.string(),
  ingredientRefs: z.array(z.string()),
  temperatureC: z.number().nullable(),
  durationSeconds: z.number().nullable(),
  equipment: z.array(z.string()),
  expectedResult: z.string().nullable(),
  timer: z.boolean(),
});

export const platingSchema = z.object({
  /** Le dressage raconté en une ou deux phrases : c'est ce qui est affiché. */
  description: z.string(),
  plate: z.string(),
  positioning: z.string(),
  quantities: z.string(),
  sauce: z.string().nullable(),
  garnish: z.string().nullable(),
  finish: z.string().nullable(),
  decoration: z.string().nullable(),
});

export const generatedRecipeSchema = z.object({
  name: z.string(),
  description: z.string(),
  servings: z.number(),
  difficulty: z.enum(["easy", "medium", "hard"]),
  prepTimeSeconds: z.number(),
  cookTimeSeconds: z.number(),
  restTimeSeconds: z.number(),
  season: z.array(z.string()),
  equipment: z.array(z.string()),
  cuisineLabel: z.string(),
  /** Mention explicite « fusion / interprétation créative », null si recette traditionnelle. */
  fusionLabel: z.string().nullable(),
  ingredients: z.array(recipeIngredientSchema),
  steps: z.array(recipeStepSchema),
  plating: platingSchema,
  allergens: z.array(z.enum(ALLERGEN_CODES)),
  diets: z.array(z.string()),
  tips: z.array(z.string()),
});

export type GeneratedRecipe = z.infer<typeof generatedRecipeSchema>;
export type GeneratedIngredient = z.infer<typeof recipeIngredientSchema>;
export type GeneratedStep = z.infer<typeof recipeStepSchema>;

/** Seuils de complétude : une recette en dessous est renvoyée au modèle pour correction. */
const MIN_STEPS = 3;
const MIN_TEXT = 10;

/** Jeton de quantité dans le texte d'une étape : {{i3}} ou {{i3:50}} (voir @culinova/core). */
const QUANTITY_TOKEN = /\{\{\s*([A-Za-z0-9_-]+)\s*(?::\s*\d+(?:[.,]\d+)?\s*)?\}\}/g;

/**
 * Règles métier vérifiées après le schéma. Renvoie la liste des problèmes
 * (vide si la recette est valide) : ils sont renvoyés au modèle pour correction.
 */
export function recipeProblems(recipe: GeneratedRecipe, expectedServings: number): string[] {
  const problems: string[] = [];
  if (recipe.servings !== expectedServings) {
    problems.push(`servings doit valoir ${expectedServings} (reçu ${recipe.servings}).`);
  }
  if (recipe.ingredients.length === 0) problems.push("La liste des ingrédients est vide.");
  if (recipe.steps.length === 0) problems.push("La liste des étapes est vide.");
  else if (recipe.steps.length < MIN_STEPS) {
    problems.push(
      `La recette doit compter au moins ${MIN_STEPS} étapes complètes (reçu ${recipe.steps.length}).`,
    );
  }
  if (recipe.plating.description.trim().length < MIN_TEXT) {
    problems.push("plating.description est vide : raconte le dressage en une ou deux phrases.");
  }
  const refs = new Set<string>();
  for (const ingredient of recipe.ingredients) {
    if (refs.has(ingredient.ref)) problems.push(`Référence d'ingrédient en double : ${ingredient.ref}.`);
    refs.add(ingredient.ref);
    if (!(ingredient.quantity > 0)) problems.push(`Quantité invalide pour « ${ingredient.name} ».`);
    if (ingredient.unit !== "g") {
      problems.push(
        `« ${ingredient.name} » doit être pesé en grammes (unit = "g", reçu ${ingredient.unit}).`,
      );
    }
  }
  recipe.steps.forEach((step, index) => {
    for (const ref of step.ingredientRefs) {
      if (!refs.has(ref)) problems.push(`L'étape ${index + 1} cite un ingrédient inconnu : ${ref}.`);
    }
    for (const match of step.action.matchAll(QUANTITY_TOKEN)) {
      if (!refs.has(match[1]!)) {
        problems.push(`L'étape ${index + 1} contient un jeton de quantité inconnu : ${match[0]}.`);
      }
    }
    if (step.action.trim().length < MIN_TEXT) {
      problems.push(`L'étape ${index + 1} est vide ou incomplète : rédige l'action complète.`);
    }
    if (step.durationSeconds !== null && step.durationSeconds < 0) {
      problems.push(`Durée négative à l'étape ${index + 1}.`);
    }
  });
  // Chaque ingrédient doit servir dans au moins une étape (sinon la recette est incomplète).
  const used = new Set(recipe.steps.flatMap((step) => step.ingredientRefs));
  for (const match of recipe.steps.flatMap((step) => [...step.action.matchAll(QUANTITY_TOKEN)])) {
    used.add(match[1]!);
  }
  const unused = recipe.ingredients.filter((i) => !used.has(i.ref)).map((i) => `${i.ref} (${i.name})`);
  if (unused.length > 0 && recipe.steps.length > 0) {
    problems.push(`Ingrédients jamais utilisés dans les étapes : ${unused.join(", ")}.`);
  }
  for (const [field, value] of [
    ["prepTimeSeconds", recipe.prepTimeSeconds],
    ["cookTimeSeconds", recipe.cookTimeSeconds],
    ["restTimeSeconds", recipe.restTimeSeconds],
  ] as const) {
    if (!Number.isInteger(value) || value < 0) problems.push(`${field} doit être un entier positif ou nul.`);
  }
  return problems;
}

/** Contenu pour les réseaux sociaux (étape 11 du wizard). */
export const socialContentSchema = z.object({
  title: z.string(),
  description: z.string(),
  shortText: z.string(),
  instagramCaption: z.string(),
  tiktok: z.string(),
  pinterest: z.string(),
  linkedin: z.string(),
  hashtags: z.array(z.string()),
});

export type SocialContent = z.infer<typeof socialContentSchema>;
