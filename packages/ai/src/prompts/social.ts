/** Prompt versionné du contenu pour les réseaux sociaux (étape 11 du wizard). */
import type { GeneratedRecipe } from "../schemas";
import type { RecipeLanguage } from "./request";

export const SOCIAL_PROMPT_VERSION = "social.generate@1";

export const SOCIAL_SYSTEM_PROMPT = `Tu rédiges le contenu des réseaux sociaux d'un créateur culinaire qui publie ses recettes créées avec Culinova.

Pour la recette fournie, produis : un titre accrocheur, une description de 2 à 3 phrases, un texte court (une phrase), une légende Instagram (avec émojis sobres et appel à l'action), un texte pour une vidéo TikTok (accroche des premières secondes puis déroulé), une description Pinterest optimisée pour la recherche, un post LinkedIn (ton professionnel, savoir-faire, chiffrage), et 8 à 15 hashtags sans le caractère #.

Reste fidèle à la recette (aucun ingrédient absent), à sa cuisine et à son style ; si la recette est une fusion ou une interprétation créative, ne la présente pas comme traditionnelle. Écris dans la langue demandée.`;

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
    plating: recipe.plating,
  };
  return {
    system: SOCIAL_SYSTEM_PROMPT,
    user: `Langue du contenu : ${language === "fr" ? "français" : "anglais (English)"}\n\nRecette :\n${JSON.stringify(summary, null, 2)}`,
  };
}
