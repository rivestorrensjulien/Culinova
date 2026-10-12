/**
 * Aliments de référence (table Ciqual, USDA) : recherche plein texte simple,
 * en mémoire (environ 3 500 aliments), pour proposer des candidats à l'IA et
 * pour la recherche manuelle d'une correspondance.
 */
import type { Database } from "@culinova/db";
import * as s from "@culinova/db/schema";
import { eq } from "drizzle-orm";

export interface FoodEntry {
  id: string;
  source: "ciqual" | "usda";
  code: string;
  nameFr: string | null;
  nameEn: string | null;
  /** Mots du nom (avant la première virgule) et du reste, normalisés. */
  head: string[];
  rest: string[];
}

const STOP_WORDS = new Set([
  "de",
  "du",
  "des",
  "la",
  "le",
  "les",
  "l",
  "d",
  "a",
  "au",
  "aux",
  "en",
  "et",
  "ou",
  "avec",
  "sans",
  "pour",
  "un",
  "une",
  "the",
  "of",
  "and",
  "with",
]);

/** Minuscules, sans accents, ligatures dépliées, mots au singulier simple. */
export function words(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/œ/g, "oe")
    .replace(/æ/g, "ae")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .split(/[^a-z0-9]+/)
    .filter((word) => word.length > 0 && !STOP_WORDS.has(word))
    .map((word) => (word.length > 3 && /[sx]$/.test(word) ? word.slice(0, -1) : word));
}

function entry(row: typeof s.nutritionFoods.$inferSelect): FoodEntry {
  const name = row.nameFr ?? row.nameEn ?? "";
  const [head = "", ...rest] = name.split(",");
  return {
    id: row.id,
    source: row.source,
    code: row.code,
    nameFr: row.nameFr,
    nameEn: row.nameEn,
    head: words(head),
    rest: words(rest.join(" ")),
  };
}

const CACHE_MS = 60 * 60 * 1000;
const cache = new WeakMap<Database, { at: number; foods: FoodEntry[] }>();

/** Aliments Ciqual (gardés en mémoire une heure). */
export async function ciqualFoods(db: Database): Promise<FoodEntry[]> {
  const cached = cache.get(db);
  if (cached && Date.now() - cached.at < CACHE_MS && cached.foods.length > 0) return cached.foods;
  const rows = await db.select().from(s.nutritionFoods).where(eq(s.nutritionFoods.source, "ciqual"));
  const foods = rows.map(entry);
  cache.set(db, { at: Date.now(), foods });
  return foods;
}

/** Pertinence d'un aliment pour un nom d'ingrédient (0 = sans rapport). */
export function score(query: string[], food: FoodEntry): number {
  let total = 0;
  let matched = 0;
  for (const word of query) {
    if (food.head.includes(word)) {
      total += 3;
      matched += 1;
    } else if (food.rest.includes(word)) {
      total += 1;
      matched += 1;
    } else if (
      word.length >= 4 &&
      [...food.head, ...food.rest].some((w) => w.startsWith(word) || (word.startsWith(w) && w.length >= 4))
    ) {
      total += 1;
      matched += 1;
    }
  }
  if (matched === 0) return 0;
  // Le premier mot porte le sens en français (« vinaigre de riz » est un vinaigre).
  if (query[0] === food.head[0]) total += 1.5;
  // Un ingrédient se pèse en général cru ; les noms courts (génériques) passent devant.
  const all = [...food.head, ...food.rest];
  if (!query.includes("cuit") && (all.includes("cru") || all.includes("crue"))) total += 1;
  return total - 0.15 * all.filter((word) => !query.includes(word)).length;
}

/** Meilleurs aliments pour un nom donné. */
export function bestFoods(name: string, foods: readonly FoodEntry[], limit = 8): FoodEntry[] {
  const query = words(name);
  if (query.length === 0) return [];
  return foods
    .map((food) => ({ food, value: score(query, food) }))
    .filter((item) => item.value > 0)
    .sort((a, b) => b.value - a.value || (a.food.nameFr ?? "").localeCompare(b.food.nameFr ?? ""))
    .slice(0, limit)
    .map((item) => item.food);
}

export function foodName(food: { nameFr: string | null; nameEn: string | null }, language: string): string {
  return (language === "en" ? (food.nameEn ?? food.nameFr) : (food.nameFr ?? food.nameEn)) ?? "";
}
