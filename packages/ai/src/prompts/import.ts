/**
 * Prompt versionné d'import : une recette existante (texte copié, page web) est
 * réécrite au format Culinova, sans en changer le fond.
 */
import { RECIPE_SYSTEM_PROMPT } from "./recipe";

export const RECIPE_IMPORT_PROMPT_VERSION = "recipe.import@1";

/** Longueur maximale du texte source transmis au modèle. */
export const IMPORT_MAX_CHARS = 20_000;

export function buildImportPrompt(source: string, language: "fr" | "en"): { system: string; user: string } {
  return {
    system: RECIPE_SYSTEM_PROMPT,
    user: `Langue de la recette : ${language === "en" ? "anglais" : "français"}

La personne importe une recette existante (texte copié ou contenu d'une page web, parfois avec du texte parasite : menus, publicités, commentaires). La voici :
"""
${source.slice(0, IMPORT_MAX_CHARS).trim()}
"""

Réécris cette recette au format demandé, fidèlement :
- Garde le plat, ses ingrédients, leurs quantités et l'ordre des étapes ; ne crée pas une autre recette. Ignore tout ce qui n'est pas la recette.
- servings = le nombre de personnes ou de portions indiqué par la source (4 s'il n'est pas indiqué).
- Convertis les quantités en grammes (tasses, cuillères, pièces, onces…), avec la mesure parlante entre parenthèses quand elle aide (œufs, cuillères, cl).
- Complète ce qui manque de façon raisonnable et discrète : temps, matériel, résultat attendu de chaque étape, dressage, allergènes, régimes, astuces.
- Toutes les règles de rédaction s'appliquent (jetons de quantité dans les étapes, dressage raconté, matériel cohérent, storeBought, vocabulaire utilisé en France).
- Si le texte ne contient aucune recette exploitable, renvoie quand même une recette minimale cohérente avec le titre trouvé, en le signalant dans tips.`,
  };
}
