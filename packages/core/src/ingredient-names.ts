/**
 * Normalisation des noms d'ingrédients, pour rapprocher un ingrédient proposé
 * par l'IA (« 2 gousses d'Ail », « Ails frais ») de la base (« ail »).
 */

const ARTICLES = /^(?:le|la|les|l'|du|de la|de l'|des|d'|de|un|une|the|a|an|some)\s+/;

/** Clé de comparaison : minuscules, sans accents, sans article, au singulier. */
export function normalizeIngredientName(name: string): string {
  let text = name
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[’`]/g, "'")
    .replace(/\(.*?\)/g, " ")
    .replace(/[^a-z0-9' -]/g, " ")
    .replace(/-/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  // Retire une éventuelle quantité en tête (« 2 », « 200 g de »).
  text = text.replace(/^\d+(?:[.,]\d+)?\s*(?:g|kg|ml|cl|l)?\s+(?:de |d')?/, "");
  text = text.replace(/^(?:l'|d')/, "");
  text = text.replace(ARTICLES, "");
  return text
    .split(" ")
    .filter(Boolean)
    .map((word) => (word.length > 3 && /[sx]$/.test(word) && !/ss$/.test(word) ? word.slice(0, -1) : word))
    .join(" ");
}
