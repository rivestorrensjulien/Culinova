/**
 * Correspondances ingrédient → aliment de référence, propres à chaque personne.
 * L'IA propose (parmi des candidats Ciqual présélectionnés, USDA en complément),
 * la personne valide ou corrige. Gratuit (hors quotas), borné par le plafond de budget IA.
 */
import {
  AiGenerationError,
  buildNutritionMatchPrompt,
  type LlmAdapter,
  NUTRITION_MATCH_MAX_ITEMS,
  NUTRITION_MATCH_PROMPT_VERSION,
  type NutritionMatchItem,
  nutritionMatchProblems,
  nutritionMatchSchema,
} from "@culinova/ai";
import { isWithinBudget } from "@culinova/core";
import type { Database } from "@culinova/db";
import * as s from "@culinova/db/schema";
import { and, eq, inArray, isNull, or } from "drizzle-orm";
import { getAiBudgetCap, getAiSpend, recordAiSpend } from "../quotas";
import { bestFoods, ciqualFoods, foodName } from "./foods";
import { searchUsda } from "./usda";

/** Coût maximal estimé d'un appel (40 ingrédients et leurs candidats). */
const MATCH_COST_USD_MICROS = 80_000;

export type MatchRefusal = "empty" | "budget" | "failed" | "no_table";
export type MatchResult = { ok: true; proposed: number } | { ok: false; reason: MatchRefusal };

/** Ingrédients de la version active d'une recette, et de ses préparations faites maison. */
export async function recipeIngredientIds(db: Database, userId: string, recipeId: string): Promise<string[]> {
  const ids = new Set<string>();
  let recipeIds = [recipeId];
  for (let depth = 0; depth < 3 && recipeIds.length > 0; depth++) {
    const rows = await db
      .select({
        ingredientId: s.recipeIngredients.ingredientId,
        baseRecipeId: s.recipeIngredients.baseRecipeId,
      })
      .from(s.recipes)
      .innerJoin(s.recipeIngredients, eq(s.recipeIngredients.recipeVersionId, s.recipes.currentVersionId))
      .where(
        and(inArray(s.recipes.id, recipeIds), eq(s.recipes.ownerId, userId), isNull(s.recipes.deletedAt)),
      );
    const baseIds = [...new Set(rows.flatMap((r) => (r.baseRecipeId ? [r.baseRecipeId] : [])))];
    for (const row of rows) if (row.ingredientId && !row.baseRecipeId) ids.add(row.ingredientId);
    recipeIds =
      baseIds.length === 0
        ? []
        : (
            await db
              .select({ recipeId: s.baseRecipes.recipeId })
              .from(s.baseRecipes)
              .where(inArray(s.baseRecipes.id, baseIds))
          ).map((r) => r.recipeId);
  }
  return [...ids];
}

export async function proposeNutritionMatches(
  db: Database,
  ai: LlmAdapter,
  userId: string,
  ingredientIds: readonly string[],
  options: { languageCode?: string; usdaApiKey?: string; fetchImpl?: typeof fetch } = {},
): Promise<MatchResult> {
  const language = options.languageCode ?? "fr";
  if (ingredientIds.length === 0) return { ok: false, reason: "empty" };
  const existing = await db
    .select({ ingredientId: s.ingredientNutritionLinks.ingredientId })
    .from(s.ingredientNutritionLinks)
    .where(
      and(
        eq(s.ingredientNutritionLinks.ownerId, userId),
        inArray(s.ingredientNutritionLinks.ingredientId, [...ingredientIds]),
      ),
    );
  const linked = new Set(existing.map((e) => e.ingredientId));
  const wanted = [...new Set(ingredientIds)]
    .filter((id) => !linked.has(id))
    .slice(0, NUTRITION_MATCH_MAX_ITEMS);
  if (wanted.length === 0) return { ok: false, reason: "empty" };

  const rows = await db
    .select({
      id: s.ingredients.id,
      canonicalName: s.ingredients.canonicalName,
      translated: s.ingredientTranslations.name,
    })
    .from(s.ingredients)
    .leftJoin(
      s.ingredientTranslations,
      and(
        eq(s.ingredientTranslations.ingredientId, s.ingredients.id),
        eq(s.ingredientTranslations.languageCode, language),
      ),
    )
    .where(
      and(
        inArray(s.ingredients.id, wanted),
        or(eq(s.ingredients.scope, "global"), eq(s.ingredients.ownerId, userId)),
      ),
    );
  if (rows.length === 0) return { ok: false, reason: "empty" };

  const foods = await ciqualFoods(db);
  if (foods.length === 0) return { ok: false, reason: "no_table" };

  const [cap, spent] = await Promise.all([getAiBudgetCap(db), getAiSpend(db)]);
  if (!isWithinBudget(spent, cap, MATCH_COST_USD_MICROS)) return { ok: false, reason: "budget" };

  // Identifiants courts dans le prompt ; candidats Ciqual présélectionnés par le texte.
  const items: NutritionMatchItem[] = rows.map((row, index) => ({
    id: `n${index + 1}`,
    name: row.translated ?? row.canonicalName,
    candidates: bestFoods(row.translated ?? row.canonicalName, foods).map((food) => ({
      code: food.code,
      name: foodName(food, "fr"),
    })),
  }));
  const ingredientOf = new Map(items.map((item, index) => [item.id, rows[index]!.id]));
  const foodOf = new Map(foods.map((food) => [food.code, food.id]));
  const prompt = buildNutritionMatchPrompt(items);

  const [generation] = await db
    .insert(s.aiGenerations)
    .values({
      userId,
      kind: "analysis",
      status: "running",
      inputRef: `nutrition:${rows.length}`,
      promptVersion: NUTRITION_MATCH_PROMPT_VERSION,
      startedAt: new Date(),
    })
    .returning({ id: s.aiGenerations.id });

  try {
    const result = await ai.generateStructured({
      promptId: NUTRITION_MATCH_PROMPT_VERSION,
      system: prompt.system,
      user: prompt.user,
      schema: nutritionMatchSchema,
      validate: (data) => nutritionMatchProblems(data, items),
      maxOutputTokens: 8_000,
    });

    const links: Array<typeof s.ingredientNutritionLinks.$inferInsert> = [];
    for (const match of result.data.matches) {
      const ingredientId = ingredientOf.get(match.id);
      if (!ingredientId) continue;
      let foodId = match.code ? (foodOf.get(match.code) ?? null) : null;
      // Absent de Ciqual : USDA FoodData Central en complément (si une clé est configurée).
      if (!foodId && options.usdaApiKey) {
        const usda = await searchUsda(match.englishName, options.usdaApiKey, options.fetchImpl);
        if (usda) {
          const [food] = await db
            .insert(s.nutritionFoods)
            .values({
              source: "usda",
              code: String(usda.fdcId),
              nameEn: usda.description,
              per100g: usda.per100g,
            })
            .onConflictDoUpdate({
              target: [s.nutritionFoods.source, s.nutritionFoods.code],
              set: { per100g: usda.per100g, nameEn: usda.description, updatedAt: new Date() },
            })
            .returning({ id: s.nutritionFoods.id });
          foodId = food?.id ?? null;
        }
      }
      links.push({ ownerId: userId, ingredientId, foodId, status: "proposed" });
    }
    if (links.length > 0) await db.insert(s.ingredientNutritionLinks).values(links).onConflictDoNothing();

    await db
      .update(s.aiGenerations)
      .set({
        status: "succeeded",
        finishedAt: new Date(),
        output: { matches: result.data.matches },
        provider: result.usage.provider,
        model: result.usage.model,
        tokensIn: result.usage.inputTokens,
        tokensOut: result.usage.outputTokens,
        costUsdMicros: result.usage.costUsdMicros,
        attempts: result.usage.attempts,
      })
      .where(eq(s.aiGenerations.id, generation!.id));
    await recordAiSpend(db, result.usage.costUsdMicros);
    return { ok: true, proposed: links.length };
  } catch (error) {
    const usage = error instanceof AiGenerationError ? error.usage : undefined;
    console.error(
      `Correspondance nutritionnelle en échec : ${error instanceof Error ? error.message : String(error)}`,
    );
    await db
      .update(s.aiGenerations)
      .set({
        status: "failed",
        finishedAt: new Date(),
        error: error instanceof Error ? error.message.slice(0, 1000) : String(error),
        costUsdMicros: usage?.costUsdMicros ?? 0,
      })
      .where(eq(s.aiGenerations.id, generation!.id));
    if (usage?.costUsdMicros) await recordAiSpend(db, usage.costUsdMicros);
    return { ok: false, reason: "failed" };
  }
}

/** Choix (ou correction) d'une correspondance par la personne : elle est alors validée. */
export async function setNutritionLink(
  db: Database,
  userId: string,
  ingredientId: string,
  foodId: string | null,
): Promise<boolean> {
  const [ingredient] = await db
    .select({ id: s.ingredients.id })
    .from(s.ingredients)
    .where(
      and(
        eq(s.ingredients.id, ingredientId),
        or(eq(s.ingredients.scope, "global"), eq(s.ingredients.ownerId, userId)),
      ),
    );
  if (!ingredient) return false;
  if (foodId) {
    const [food] = await db
      .select({ id: s.nutritionFoods.id })
      .from(s.nutritionFoods)
      .where(eq(s.nutritionFoods.id, foodId));
    if (!food) return false;
  }
  await db
    .insert(s.ingredientNutritionLinks)
    .values({ ownerId: userId, ingredientId, foodId, status: "validated" })
    .onConflictDoUpdate({
      target: [s.ingredientNutritionLinks.ownerId, s.ingredientNutritionLinks.ingredientId],
      set: { foodId, status: "validated", updatedAt: new Date() },
    });
  return true;
}

/** Valide toutes les correspondances proposées pour ces ingrédients. */
export async function validateNutritionLinks(
  db: Database,
  userId: string,
  ingredientIds: readonly string[],
): Promise<number> {
  if (ingredientIds.length === 0) return 0;
  const rows = await db
    .update(s.ingredientNutritionLinks)
    .set({ status: "validated", updatedAt: new Date() })
    .where(
      and(
        eq(s.ingredientNutritionLinks.ownerId, userId),
        inArray(s.ingredientNutritionLinks.ingredientId, [...ingredientIds]),
        eq(s.ingredientNutritionLinks.status, "proposed"),
      ),
    )
    .returning({ id: s.ingredientNutritionLinks.ingredientId });
  return rows.length;
}

/** Recherche manuelle d'un aliment (Ciqual) pour corriger une correspondance. */
export async function searchFoods(db: Database, query: string, language = "fr", limit = 12) {
  const foods = await ciqualFoods(db);
  return bestFoods(query, foods, limit).map((food) => ({
    id: food.id,
    name: foodName(food, language),
    source: food.source,
    code: food.code,
  }));
}
