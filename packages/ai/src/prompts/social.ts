/** Prompt versionné du contenu pour les réseaux sociaux (étape 11 du wizard). */
import type { GeneratedRecipe } from "../schemas";
import type { RecipeLanguage } from "./request";

export const SOCIAL_PROMPT_VERSION = "social.generate@3";

export const SOCIAL_SYSTEM_PROMPT = `Tu rédiges le contenu des réseaux sociaux d'un créateur culinaire qui publie ses recettes créées avec Culinova.

Pour la recette fournie, produis : un titre accrocheur, une description de 2 à 3 phrases, un texte court (une phrase), une légende Instagram (avec émojis sobres et appel à l'action), un script de vidéo TikTok (voir ci-dessous), une description Pinterest optimisée pour la recherche, un post LinkedIn (ton professionnel, savoir-faire, chiffrage), et 8 à 15 hashtags sans le caractère #.

Présentation (titre, description, texte court) : aucune répétition ni redondance.
- Chaque idée n'apparaît qu'une fois : ne redis pas la même origine, le même style ou les mêmes ingrédients avec d'autres mots (ex. « street food d'Asie du Sud-Est revisitée » puis « fusion Asie du Sud-Est × street food »).
- La mention de fusion ou d'interprétation créative est déjà affichée à part : évoque-la au plus une fois, sans recopier son libellé.
- La dernière phrase de la description et le texte court apportent une information nouvelle (texture, moment, astuce, envie), sans résumer à nouveau le plat déjà décrit au début.

Script TikTok : clair et facile à tourner, une ligne par scène (retour à la ligne entre chaque), dans l'ordre réel de la recette, 8 lignes au maximum, sans quantités :
Accroche (0-3 s) : une phrase qui donne envie.
Plan 1 : …
Plan 2 : …
(un plan par geste clé : présenter les ingrédients, puis les grandes étapes, puis le dressage)
Le dernier plan est le dressage avec l'appel à l'action : il est numéroté comme les autres (pas de ligne « Final »).
Même ligne de conduite pour chaque plan : la phrase commence par un verbe à l'infinitif (ex. « Plan 1 : Disposer les ingrédients sur le plan de travail », « Plan 4 : Dresser les bao dans le panier vapeur et inviter à enregistrer la recette »).
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

/**
 * Contrôle du script TikTok : une accroche, puis des plans numérotés dans l'ordre
 * (le dressage final est un plan comme les autres), 8 lignes au plus.
 */
export function socialProblems(social: { tiktok: string }): string[] {
  const lines = social.tiktok
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const problems: string[] = [];
  if (!/^accroche\b/i.test(lines[0] ?? ""))
    problems.push("tiktok doit commencer par la ligne « Accroche (0-3 s) : … ».");
  lines.slice(1).forEach((line, index) => {
    const plan = /^plan (\d+)\s*:\s*\S/i.exec(line);
    if (!plan || Number(plan[1]) !== index + 1) {
      problems.push(
        `tiktok, ligne ${index + 2} : attendu « Plan ${index + 1} : » suivi d'un verbe (pas de ligne « Final »).`,
      );
    }
  });
  if (lines.length < 3) problems.push("tiktok doit compter une accroche et au moins deux plans.");
  if (lines.length > 8) problems.push("tiktok doit compter 8 lignes au plus.");
  return problems;
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
