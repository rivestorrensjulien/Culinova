/**
 * Prompt versionné de correspondance entre les ingrédients d'une recette et les
 * aliments de la table Ciqual (ANSES). L'IA choisit parmi des candidats présélectionnés ;
 * la personne valide ou corrige chaque correspondance.
 */
import { z } from "zod";

export const NUTRITION_MATCH_PROMPT_VERSION = "nutrition.match@1";

/** Nombre maximal d'ingrédients traités en une fois. */
export const NUTRITION_MATCH_MAX_ITEMS = 40;

export const NUTRITION_MATCH_SYSTEM_PROMPT = `Tu es diététicien. On te donne les ingrédients d'une recette et, pour chacun, une liste d'aliments candidats de la table de composition Ciqual (ANSES), avec leur code.

Pour chaque ingrédient, choisis le candidat qui décrit le mieux l'ingrédient tel qu'il est pesé dans la recette :
- l'état avant préparation (cru plutôt que cuit, sauf si l'ingrédient est déjà cuit ou prêt à l'emploi) ;
- l'aliment générique le plus proche quand il n'existe pas d'équivalent exact (ex. « riz à sushi » → riz blanc, cru) ;
- un produit transformé comparable pour un produit acheté tout prêt (sauce, pâte, condiment).
code vaut null seulement si aucun candidat ne convient vraiment (ex. ingrédient absent de la liste).
englishName : le nom de l'ingrédient en anglais, court et générique (ex. « sushi rice »), pour une recherche dans une autre table.

Réponds pour chaque identifiant reçu, sans en inventer ni en oublier.`;

export const nutritionMatchSchema = z.object({
  matches: z.array(
    z.object({
      id: z.string(),
      code: z.string().nullable(),
      englishName: z.string(),
    }),
  ),
});

export type NutritionMatch = z.infer<typeof nutritionMatchSchema>["matches"][number];

export interface NutritionMatchItem {
  id: string;
  name: string;
  candidates: Array<{ code: string; name: string }>;
}

export function buildNutritionMatchPrompt(items: readonly NutritionMatchItem[]): {
  system: string;
  user: string;
} {
  const blocks = items.map((item) =>
    [
      `- ${item.id} · ${item.name}`,
      ...(item.candidates.length > 0
        ? item.candidates.map((c) => `  · ${c.code} · ${c.name}`)
        : ["  (aucun candidat)"]),
    ].join("\n"),
  );
  return {
    system: NUTRITION_MATCH_SYSTEM_PROMPT,
    user: `Ingrédients (identifiant · nom), avec les aliments candidats (code · nom) :\n${blocks.join("\n")}`,
  };
}

/** Problèmes à renvoyer au modèle : identifiants manquants ou inconnus, code hors des candidats. */
export function nutritionMatchProblems(
  data: z.infer<typeof nutritionMatchSchema>,
  items: readonly NutritionMatchItem[],
): string[] {
  const byId = new Map(items.map((item) => [item.id, item]));
  const seen = new Set<string>();
  const problems: string[] = [];
  for (const match of data.matches) {
    const item = byId.get(match.id);
    if (!item) {
      problems.push(`Identifiant inconnu : ${match.id}.`);
      continue;
    }
    if (seen.has(match.id)) problems.push(`Identifiant en double : ${match.id}.`);
    seen.add(match.id);
    if (match.code !== null && !item.candidates.some((c) => c.code === match.code)) {
      problems.push(`Le code ${match.code} n'est pas parmi les candidats de ${match.id}.`);
    }
  }
  for (const id of byId.keys()) if (!seen.has(id)) problems.push(`Correspondance manquante pour ${id}.`);
  return problems;
}
