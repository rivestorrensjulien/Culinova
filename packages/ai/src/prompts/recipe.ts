/**
 * Prompts versionnés de génération de recette. Changer le texte d'un prompt =
 * changer sa version : chaque génération enregistre la version utilisée.
 */
import { isFusion, type RecipeRequest } from "./request";

export const RECIPE_PROMPT_VERSION = "recipe.generate@1";
export const RECIPE_REGENERATE_PROMPT_VERSION = "recipe.regenerate@1";

const LANGUAGE_NAMES = { fr: "français", en: "anglais (English)" } as const;

/** Texte fixe (mis en cache par l'API) : rôle, exigences de qualité, conventions de sortie. */
export const RECIPE_SYSTEM_PROMPT = `Tu es le chef et rédacteur culinaire de Culinova, une plateforme qui aide des cuisiniers — du passionné au professionnel — à créer des recettes originales, fiables et chiffrables.

Ce que tu produis est une recette complète, reproductible par un débutant, au format JSON demandé.

Exigences :
- Les paramètres de création (moment, influence, région, pays, cuisine(s), style, langue, mode, saisie, nombre de personnes) construisent la recette : ingrédients, techniques, cuissons, épices, sauces, vocabulaire et dressage doivent en découler.
- Respecte le style demandé. « Style traditionnel » : fidèle aux recettes et aux gestes de référence. « Interprétation créative » ou plusieurs cuisines : une relecture libre, que tu signales toujours dans fusionLabel (ex. « Fusion France × Japon — interprétation créative ») ; ne la présente jamais comme traditionnelle. Pour une recette traditionnelle, fusionLabel vaut null.
- Mode « ingrédients » : utilise en priorité les ingrédients disponibles et respecte les quantités indiquées comme maximum ; tu peux ajouter des produits de base courants (sel, huile, épices…).
- Quantités : unités internes uniquement — grammes (g) pour les solides, millilitres (ml) pour les liquides, pièces (piece) pour ce qui se compte (œufs, gousses…). Arrondis à des valeurs réalistes. Si une mesure de cuisine est plus parlante (cuillère, pincée), indique-la aussi dans displayQuantity/displayUnit.
- Toutes les quantités correspondent exactement au nombre de personnes demandé (champ servings).
- Mise en place : chaque ingrédient a une référence unique (i1, i2…) ; les étapes citent les ingrédients qu'elles utilisent par ces références.
- Étapes : une action précise par étape, avec quantité utilisée, température (°C), durée (secondes), matériel et résultat attendu quand c'est pertinent ; timer = true quand un minuteur aide. Phases dans l'ordre : mise_en_place, puis cooking, puis plating.
- Dressage : assiette, positionnement, quantités par assiette, sauce, garniture, finition, décoration — réalisable avec les seuls ingrédients de la recette (il servira à générer la photo).
- Durées en secondes, températures en °C. Indique les allergènes parmi les 14 allergènes réglementaires, les régimes compatibles (vegan, vegetarian, gluten_free, lactose_free, halal, kosher, keto…) et la saison.
- Respecte strictement les contraintes de régime, d'allergies et d'ingrédients non désirés.
- Rédige tous les textes dans la langue demandée, avec un vocabulaire culinaire juste (traduction culinaire, pas littérale).`;

function list(items: string[]): string {
  return items.length > 0 ? items.join(", ") : "—";
}

/** Description lisible des paramètres, commune à la génération et à la régénération. */
export function describeRequest(request: RecipeRequest): string {
  const lines = [
    `Moment de consommation : ${request.moment}`,
    `Influence culinaire : ${request.influence ?? "aucune"}`,
  ];
  if (request.region) lines.push(`Région : ${request.region}`);
  if (request.country) lines.push(`Pays : ${request.country}`);
  if (request.cuisines.length > 0) {
    lines.push(isFusion(request) ? "Cuisines à fusionner :" : "Cuisine :");
    for (const cuisine of request.cuisines) {
      const where = [cuisine.country, cuisine.region].filter(Boolean).join(", ");
      lines.push(`- ${cuisine.label}${where ? ` (${where})` : ""}`);
      if (cuisine.description) lines.push(`  Description : ${cuisine.description}`);
      if (cuisine.signatureIngredients.length)
        lines.push(`  Ingrédients caractéristiques : ${list(cuisine.signatureIngredients)}`);
      if (cuisine.techniques.length) lines.push(`  Techniques : ${list(cuisine.techniques)}`);
      if (cuisine.spices.length) lines.push(`  Épices et aromates : ${list(cuisine.spices)}`);
      if (cuisine.referenceDishes.length)
        lines.push(`  Plats de référence : ${list(cuisine.referenceDishes)}`);
    }
  }
  lines.push(
    `Style : ${request.style.label}${request.style.description ? ` — ${request.style.description}` : ""}`,
  );
  if (isFusion(request))
    lines.push("Plusieurs cuisines sont choisies : c'est une fusion, à signaler dans fusionLabel.");
  lines.push(`Langue de la recette : ${LANGUAGE_NAMES[request.language]}`);
  const modeLabel = {
    ingredients: "à partir des ingrédients disponibles",
    name: "à partir du nom d'une recette",
    idea: "à partir d'une idée",
  }[request.mode];
  lines.push(`Mode de création : ${modeLabel}`);
  lines.push(`Saisie de la personne :\n"""\n${request.input.trim()}\n"""`);
  lines.push(`Nombre de personnes : ${request.servings}`);
  const { diets, allergens, dislikedIngredients } = request.constraints;
  if (diets.length) lines.push(`Régimes à respecter : ${list(diets)}`);
  if (allergens.length) lines.push(`Allergènes à exclure : ${list(allergens)}`);
  if (dislikedIngredients.length) lines.push(`Ingrédients à éviter : ${list(dislikedIngredients)}`);
  return lines.join("\n");
}

export function buildRecipePrompt(request: RecipeRequest): { system: string; user: string } {
  return {
    system: RECIPE_SYSTEM_PROMPT,
    user: `Crée une recette avec les paramètres suivants.\n\n${describeRequest(request)}`,
  };
}

/** Régénération : mêmes paramètres, proposition différente (ou guidée par une consigne). */
export function buildRegenerationPrompt(
  request: RecipeRequest,
  previous: { name: string; description: string },
  instruction?: string | null,
): { system: string; user: string } {
  const guidance = instruction?.trim()
    ? `Consigne de la personne pour cette nouvelle version :\n"""\n${instruction.trim()}\n"""`
    : "Propose une recette nettement différente de la précédente (autre plat, autres techniques), avec les mêmes paramètres.";
  return {
    system: RECIPE_SYSTEM_PROMPT,
    user: `Voici les paramètres de création.\n\n${describeRequest(request)}\n\nVersion précédente : « ${previous.name} » — ${previous.description}\n\n${guidance}`,
  };
}
