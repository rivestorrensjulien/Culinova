/**
 * Traduction culinaire d'une recette (pas littérale) : noms d'ingrédients et gestes
 * tels qu'un cuisinier les écrirait dans la langue cible. Les quantités ne sont pas
 * traduites : les jetons {{i3}} restent tels quels et sont recalculés à l'affichage.
 * Une traduction est une proposition, validée ensuite par la personne.
 */
import { z } from "zod";
import type { GeneratedRecipe } from "../schemas";

export const TRANSLATE_PROMPT_VERSION = "recipe.translate@1";

export const TRANSLATION_LANGUAGES = { fr: "français", en: "anglais (English)" } as const;
export type TranslationLanguage = keyof typeof TRANSLATION_LANGUAGES;

export const TRANSLATE_SYSTEM_PROMPT = `Tu es traducteur culinaire. Tu traduis des recettes pour des cuisiniers : une traduction culinaire, pas littérale.

- Emploie les noms d'ingrédients, de gestes, de matériel et de contenants que l'on utilise réellement dans la langue cible (ex. « biscuits boudoirs » → "ladyfingers", « cul-de-poule » → "mixing bowl", « c. à soupe » → "tbsp").
- Garde le ton, la longueur et la structure : une étape traduite par étape, dans le même ordre.
- Les jetons de quantité {{i3}} ou {{i3:50}} restent EXACTEMENT tels quels, placés juste après le nom de l'ingrédient comme dans l'original. N'écris aucune quantité en chiffres.
- displayUnit : l'unité de la mesure parlante traduite (« œufs » → "eggs", « pincée » → "pinch", « cl » reste "cl"), ou null si elle est null dans l'original.
- Les noms de plats sans équivalent courant (ramen, tiramisu, bao…) restent dans leur langue d'origine.
Réponds dans la langue cible demandée, au format JSON demandé.`;

export const translationSchema = z.object({
  name: z.string(),
  description: z.string(),
  cuisineLabel: z.string(),
  fusionLabel: z.string().nullable(),
  equipment: z.array(z.string()),
  tips: z.array(z.string()),
  ingredients: z.array(z.object({ ref: z.string(), name: z.string(), displayUnit: z.string().nullable() })),
  steps: z.array(z.object({ action: z.string(), expectedResult: z.string().nullable() })),
  platingDescription: z.string(),
});

export type RecipeTranslationOutput = z.infer<typeof translationSchema>;

export function buildTranslatePrompt(
  recipe: GeneratedRecipe,
  target: TranslationLanguage,
): { system: string; user: string } {
  const source = {
    name: recipe.name,
    description: recipe.description,
    cuisineLabel: recipe.cuisineLabel,
    fusionLabel: recipe.fusionLabel,
    equipment: recipe.equipment,
    tips: recipe.tips,
    ingredients: recipe.ingredients.map((i) => ({ ref: i.ref, name: i.name, displayUnit: i.displayUnit })),
    steps: recipe.steps.map((s) => ({ action: s.action, expectedResult: s.expectedResult })),
    platingDescription: recipe.plating.description,
  };
  return {
    system: TRANSLATE_SYSTEM_PROMPT,
    user: `Langue cible : ${TRANSLATION_LANGUAGES[target]}\n\nRecette à traduire (JSON) :\n${JSON.stringify(source)}`,
  };
}

const TOKEN = /\{\{\s*[A-Za-z0-9_-]+\s*(?::\s*\d+(?:[.,]\d+)?\s*)?\}\}/g;
const tokensOf = (text: string) => [...text.matchAll(TOKEN)].map((m) => m[0].replace(/\s/g, "")).sort();

/** Contrôles : mêmes ingrédients, même nombre d'étapes, jetons de quantité conservés. */
export function translationProblems(data: RecipeTranslationOutput, recipe: GeneratedRecipe): string[] {
  const problems: string[] = [];
  const refs = recipe.ingredients.map((i) => i.ref).sort();
  const got = data.ingredients.map((i) => i.ref).sort();
  if (refs.join(",") !== got.join(",")) {
    problems.push(`ingredients doit reprendre exactement les références ${refs.join(", ")}.`);
  }
  if (data.steps.length !== recipe.steps.length) {
    problems.push(`steps doit compter ${recipe.steps.length} étapes (reçu ${data.steps.length}).`);
    return problems;
  }
  recipe.steps.forEach((step, index) => {
    const translated = data.steps[index];
    if (!translated) return;
    if (tokensOf(step.action).join(" ") !== tokensOf(translated.action).join(" ")) {
      problems.push(`Étape ${index + 1} : garde exactement les jetons de quantité de l'original.`);
    }
    if (!translated.action.trim()) problems.push(`Étape ${index + 1} vide.`);
  });
  if (!data.name.trim()) problems.push("name est vide.");
  return problems;
}
