/**
 * Recherche dans la bibliothèque, en langage courant : « poulet rapide sans gluten »,
 * « dessert facile », « moins de 20 min ». Le texte est découpé en filtres (temps,
 * régimes, difficulté, moment) et en mots à retrouver dans le nom, la cuisine ou
 * les ingrédients. Sans IA : instantané et gratuit.
 */

export interface SearchableRecipe {
  name: string;
  description: string | null;
  cuisineLabel: string | null;
  momentCode: string | null;
  momentLabel: string | null;
  totalS: number;
  difficulty: "easy" | "medium" | "hard" | null;
  diets: string[];
  ingredients: string[];
}

export interface LibraryQuery {
  terms: string[];
  maxMinutes: number | null;
  diets: string[];
  difficulty: "easy" | "medium" | "hard" | null;
  moments: string[];
}

/** Minuscules, sans accents ni ligatures, ponctuation remplacée par des espaces. */
export function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/œ/g, "oe")
    .replace(/æ/g, "ae")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

const DIETS: Array<[RegExp, string]> = [
  [/\bsans gluten\b/, "gluten_free"],
  [/\bsans lactose\b/, "lactose_free"],
  [/\b(vegan|vegane|vegetalienn?e?)\b/, "vegan"],
  [/\bvegetarienn?e?s?\b/, "vegetarian"],
  [/\bhalal\b/, "halal"],
  [/\b(casher|kasher|kosher)\b/, "kosher"],
  [/\b(keto|cetogene)\b/, "keto"],
];

const DIFFICULTY: Array<[RegExp, "easy" | "medium" | "hard"]> = [
  [/\b(facile|faciles|simple|simples)\b/, "easy"],
  [/\b(intermediaire|moyen)\b/, "medium"],
  [/\b(difficile|difficiles|avance)\b/, "hard"],
];

const STOP_WORDS = new Set([
  "de",
  "du",
  "des",
  "la",
  "le",
  "les",
  "au",
  "aux",
  "avec",
  "et",
  "pour",
  "un",
  "une",
  "en",
  "a",
  "d",
  "l",
  "recette",
  "recettes",
  "plat",
  "plats",
  "mes",
  "ma",
  "mon",
]);

function singular(word: string): string {
  return word.length > 3 && /[sx]$/.test(word) ? word.slice(0, -1) : word;
}

export function parseLibraryQuery(
  text: string,
  moments: ReadonlyArray<{ code: string; label: string }> = [],
): LibraryQuery {
  let rest = ` ${normalize(text)} `;
  const take = (pattern: RegExp) => {
    const found = pattern.test(rest);
    if (found) rest = rest.replace(pattern, " ");
    return found;
  };

  let maxMinutes: number | null = null;
  const minutes = /\b(?:moins de |en |< ?)?(\d{1,3}) ?(?:min|mn|minutes?)\b/.exec(rest);
  if (minutes) {
    maxMinutes = Number(minutes[1]);
    rest = rest.replace(minutes[0], " ");
  } else if (take(/\b(moins d (une|1) ?h(eure)?|moins d une heure|1 ?h)\b/)) maxMinutes = 60;
  else if (take(/\b(express|tres rapides?|ultra rapides?)\b/)) maxMinutes = 15;
  else if (take(/\brapides?\b/)) maxMinutes = 30;

  const diets = DIETS.filter(([pattern]) => take(pattern)).map(([, code]) => code);
  const difficulty = DIFFICULTY.find(([pattern]) => take(pattern))?.[1] ?? null;

  // Moments (« dessert », « street food »…), les libellés les plus longs d'abord.
  const found: string[] = [];
  for (const moment of [...moments].sort((a, b) => b.label.length - a.label.length)) {
    const label = normalize(moment.label);
    if (label && take(new RegExp(`\\b${label}s?\\b`))) found.push(moment.code);
  }

  const terms = rest
    .split(" ")
    .filter((word) => word.length >= 2 && !STOP_WORDS.has(word))
    .map(singular);
  return { terms, maxMinutes, diets, difficulty, moments: found };
}

export function matchesQuery(recipe: SearchableRecipe, query: LibraryQuery): boolean {
  if (query.maxMinutes !== null && recipe.totalS > query.maxMinutes * 60) return false;
  if (query.difficulty && recipe.difficulty !== query.difficulty) return false;
  if (query.diets.some((diet) => !recipe.diets.includes(diet))) return false;
  if (query.moments.length > 0 && !query.moments.includes(recipe.momentCode ?? "")) return false;
  if (query.terms.length === 0) return true;
  const haystack = normalize(
    [recipe.name, recipe.description, recipe.cuisineLabel, recipe.momentLabel, ...recipe.ingredients]
      .filter(Boolean)
      .join(" "),
  );
  return query.terms.every((term) => haystack.includes(term));
}
