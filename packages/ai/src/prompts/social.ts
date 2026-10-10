/** Prompt versionné du contenu pour les réseaux sociaux (étape 11 du wizard). */
import type { GeneratedRecipe } from "../schemas";
import type { RecipeLanguage } from "./request";

export const SOCIAL_PROMPT_VERSION = "social.generate@2";

export const SOCIAL_SYSTEM_PROMPT = `Tu rédiges le contenu des réseaux sociaux d'un créateur culinaire qui publie ses recettes créées avec Culinova.

Pour la recette fournie, produis : un titre accrocheur, une description de 2 à 3 phrases, un texte court (une phrase), une légende Instagram (avec émojis sobres et appel à l'action), un script de vidéo TikTok (voir ci-dessous), une description Pinterest optimisée pour la recherche, un post LinkedIn (ton professionnel, savoir-faire, chiffrage), et 8 à 15 hashtags sans le caractère #.

Script TikTok : clair et facile à tourner, une scène par ligne (retour à la ligne entre chaque), dans l'ordre réel de la recette, 8 lignes au maximum, sans quantités :
Accroche (0-3 s) : une phrase qui donne envie.
Plan 1 : …
Plan 2 : …
(un plan par geste clé : présenter les ingrédients, puis les grandes étapes, puis le dressage)
Final : la part dressée et un appel à l'action.
Ne donne jamais de nombre d'ingrédients ou d'étapes ; cite les ingrédients par leur nom exact, tels qu'ils figurent dans la recette fournie.

Reste fidèle à la recette (aucun ingrédient absent, aucune étape inventée), à sa cuisine et à son style ; si la recette est une fusion ou une interprétation créative, ne la présente pas comme traditionnelle. Écris dans la langue demandée.`;

export function buildSocialPrompt(
  recipe: GeneratedRecipe,
  language: RecipeLanguage,
): { system: string; user: string } {
  const summary = {
    name: recipe.name,
    description: recipe.description,
    cuisine: recipe.cuisineLabel,
    fusion: recipe.fusionLabel,
    servings: recipe.servings,
    difficulty: recipe.difficulty,
    totalTimeMinutes: Math.round(
      (recipe.prepTimeSeconds + recipe.cookTimeSeconds + recipe.restTimeSeconds) / 60,
    ),
    ingredients: recipe.ingredients.map((i) => i.name),
    // Étapes dans l'ordre, jetons de quantité remplacés par le poids (le script n'en cite pas).
    steps: recipe.steps.map((step) => readableStep(step.action, recipe)),
    plating: recipe.plating,
  };
  return {
    system: SOCIAL_SYSTEM_PROMPT,
    user: `Langue du contenu : ${language === "fr" ? "français" : "anglais (English)"}\n\nRecette :\n${JSON.stringify(summary, null, 2)}`,
  };
}

/** Texte d'étape lisible : les jetons {{i3}} / {{i3:50}} deviennent « 250 g » / « 50 g ». */
function readableStep(action: string, recipe: GeneratedRecipe): string {
  const byRef = new Map(recipe.ingredients.map((i) => [i.ref, i]));
  return action.replace(
    /\{\{\s*([A-Za-z0-9_-]+)\s*(?::\s*(\d+(?:[.,]\d+)?)\s*)?\}\}/g,
    (whole, ref: string, part: string | undefined) => {
      const ingredient = byRef.get(ref);
      if (!ingredient) return whole;
      const quantity = part === undefined ? ingredient.quantity : Number(part.replace(",", "."));
      return `${quantity} ${ingredient.unit === "piece" ? "" : ingredient.unit}`.trim();
    },
  );
}
