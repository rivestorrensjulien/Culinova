/**
 * Rapprochement des ingrédients proposés par l'IA avec la base : par nom
 * (traductions, alias, ingrédients de la personne), sans tenir compte des
 * accents, articles ni pluriels. Un ingrédient inconnu est créé « à confirmer »
 * dans la base de la personne.
 */
import { normalizeIngredientName } from "@culinova/core";
import type { Database } from "@culinova/db";
import { ingredientAliases, ingredients, ingredientTranslations } from "@culinova/db/schema";
import { and, eq, isNull, or } from "drizzle-orm";

type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];

export interface IngredientToMatch {
  name: string;
  unit: "g" | "ml" | "piece";
  allergens?: string[];
}

export interface MatchResult {
  ingredientId: string;
  created: boolean;
}

export async function matchIngredients(
  tx: Database | Tx,
  ownerId: string,
  items: IngredientToMatch[],
  languageCode: string,
): Promise<MatchResult[]> {
  const visible = or(eq(ingredients.scope, "global"), eq(ingredients.ownerId, ownerId));
  const [names, aliases, canonical] = await Promise.all([
    tx
      .select({ id: ingredientTranslations.ingredientId, name: ingredientTranslations.name })
      .from(ingredientTranslations)
      .innerJoin(ingredients, eq(ingredients.id, ingredientTranslations.ingredientId))
      .where(and(visible, isNull(ingredients.deletedAt))),
    tx
      .select({ id: ingredientAliases.ingredientId, name: ingredientAliases.alias })
      .from(ingredientAliases)
      .innerJoin(ingredients, eq(ingredients.id, ingredientAliases.ingredientId))
      .where(and(visible, isNull(ingredients.deletedAt))),
    tx
      .select({ id: ingredients.id, name: ingredients.canonicalName, scope: ingredients.scope })
      .from(ingredients)
      .where(and(visible, isNull(ingredients.deletedAt))),
  ]);

  // Les ingrédients de la personne passent avant le référentiel global.
  const index = new Map<string, string>();
  for (const row of [...names, ...aliases, ...canonical.filter((c) => c.scope === "global")]) {
    index.set(normalizeIngredientName(row.name), row.id);
  }
  for (const row of canonical.filter((c) => c.scope === "owner"))
    index.set(normalizeIngredientName(row.name), row.id);

  const results: MatchResult[] = [];
  for (const item of items) {
    const key = normalizeIngredientName(item.name);
    const found = index.get(key);
    if (found) {
      results.push({ ingredientId: found, created: false });
      continue;
    }
    const [created] = await tx
      .insert(ingredients)
      .values({
        scope: "owner",
        ownerId,
        canonicalName: item.name.trim(),
        referenceUnit: item.unit,
        allergens: item.allergens ?? [],
        status: "to_confirm",
      })
      .returning({ id: ingredients.id });
    await tx
      .insert(ingredientTranslations)
      .values({ ingredientId: created!.id, languageCode, name: item.name.trim() });
    index.set(key, created!.id);
    results.push({ ingredientId: created!.id, created: true });
  }
  return results;
}
