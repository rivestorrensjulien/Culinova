/**
 * Estimation des prix par l'IA : de simples propositions, jamais enregistrées
 * telles quelles. La personne les valide ou les corrige ligne par ligne.
 * Gratuit pour la personne (hors quotas), mais borné par le plafond de budget IA.
 */
import {
  AiGenerationError,
  buildPriceEstimatePrompt,
  type LlmAdapter,
  PRICE_ESTIMATE_MAX_ITEMS,
  PRICE_ESTIMATE_PROMPT_VERSION,
  type PriceEstimateItem,
  priceEstimateProblems,
  priceEstimateSchema,
} from "@culinova/ai";
import { isWithinBudget } from "@culinova/core";
import type { Database } from "@culinova/db";
import * as s from "@culinova/db/schema";
import { and, eq, inArray, isNull, or } from "drizzle-orm";
import { getAiBudgetCap, getAiSpend, recordAiSpend } from "../quotas";
import { currentPrices, priceUnitOf, readPriceInput, savePrice } from "./prices";

/** Coût maximal estimé d'un appel (40 ingrédients), pour la vérification du plafond. */
const ESTIMATE_COST_USD_MICROS = 60_000;

export interface PriceProposal {
  ingredientId: string;
  /** Prix proposé, au format « 9.8000 ». */
  price: string;
  confidence: "high" | "medium" | "low";
  note: string | null;
}

type EstimateFailure = { ok: false; reason: "empty" | "budget" | "failed" };
export type EstimateResult = { ok: true; proposals: PriceProposal[] } | EstimateFailure;

export async function estimatePrices(
  db: Database,
  ai: LlmAdapter,
  userId: string,
  ingredientIds: readonly string[],
  languageCode = "fr",
): Promise<EstimateResult> {
  const ids = [...new Set(ingredientIds)].slice(0, PRICE_ESTIMATE_MAX_ITEMS);
  if (ids.length === 0) return { ok: false, reason: "empty" };

  const rows = await db
    .select({
      id: s.ingredients.id,
      canonicalName: s.ingredients.canonicalName,
      referenceUnit: s.ingredients.referenceUnit,
      translated: s.ingredientTranslations.name,
    })
    .from(s.ingredients)
    .leftJoin(
      s.ingredientTranslations,
      and(
        eq(s.ingredientTranslations.ingredientId, s.ingredients.id),
        eq(s.ingredientTranslations.languageCode, languageCode),
      ),
    )
    .where(
      and(
        inArray(s.ingredients.id, ids),
        isNull(s.ingredients.deletedAt),
        or(eq(s.ingredients.scope, "global"), eq(s.ingredients.ownerId, userId)),
      ),
    );
  if (rows.length === 0) return { ok: false, reason: "empty" };

  const [cap, spent] = await Promise.all([getAiBudgetCap(db), getAiSpend(db)]);
  if (!isWithinBudget(spent, cap, ESTIMATE_COST_USD_MICROS)) return { ok: false, reason: "budget" };

  // Identifiants courts dans le prompt (moins de jetons, moins d'erreurs de recopie).
  const items: PriceEstimateItem[] = rows.map((row, index) => ({
    id: `p${index + 1}`,
    name: row.translated ?? row.canonicalName,
    unit: priceUnitOf(row.referenceUnit),
  }));
  const byShortId = new Map(items.map((item, index) => [item.id, rows[index]!.id]));
  const prompt = buildPriceEstimatePrompt(items);

  const [generation] = await db
    .insert(s.aiGenerations)
    .values({
      userId,
      kind: "price_estimate",
      status: "running",
      inputRef: `ingredients:${rows.length}`,
      promptVersion: PRICE_ESTIMATE_PROMPT_VERSION,
      startedAt: new Date(),
    })
    .returning({ id: s.aiGenerations.id });

  try {
    const result = await ai.generateStructured({
      promptId: PRICE_ESTIMATE_PROMPT_VERSION,
      system: prompt.system,
      user: prompt.user,
      schema: priceEstimateSchema,
      validate: (data) => priceEstimateProblems(data, items),
      maxOutputTokens: 8_000,
    });
    const proposals: PriceProposal[] = result.data.estimates.flatMap((estimate) => {
      const ingredientId = byShortId.get(estimate.id);
      const price = readPriceInput(estimate.price.toFixed(2));
      return ingredientId && price
        ? [{ ingredientId, price, confidence: estimate.confidence, note: estimate.note }]
        : [];
    });
    await db
      .update(s.aiGenerations)
      .set({
        status: "succeeded",
        finishedAt: new Date(),
        output: { proposals },
        provider: result.usage.provider,
        model: result.usage.model,
        tokensIn: result.usage.inputTokens,
        tokensOut: result.usage.outputTokens,
        costUsdMicros: result.usage.costUsdMicros,
        attempts: result.usage.attempts,
      })
      .where(eq(s.aiGenerations.id, generation!.id));
    await recordAiSpend(db, result.usage.costUsdMicros);
    return { ok: true, proposals };
  } catch (error) {
    const usage = error instanceof AiGenerationError ? error.usage : undefined;
    console.error(`Estimation des prix en échec : ${error instanceof Error ? error.message : String(error)}`);
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

/**
 * Ingrédients d'une version de recette (et de ses bases maison) qui n'ont encore aucun prix.
 */
export async function unpricedIngredientIds(
  db: Database,
  userId: string,
  versionId: string,
  depth = 0,
): Promise<string[]> {
  const rows = await db
    .select({
      ingredientId: s.recipeIngredients.ingredientId,
      baseVersionId: s.recipes.currentVersionId,
    })
    .from(s.recipeIngredients)
    .leftJoin(s.baseRecipes, eq(s.baseRecipes.id, s.recipeIngredients.baseRecipeId))
    .leftJoin(s.recipes, and(eq(s.recipes.id, s.baseRecipes.recipeId), eq(s.recipes.ownerId, userId)))
    .where(eq(s.recipeIngredients.recipeVersionId, versionId));
  const ids = new Set<string>();
  for (const row of rows) {
    if (row.baseVersionId) {
      // Base maison : ce sont ses propres ingrédients qui comptent (une base dans une base au plus).
      if (depth < 1) {
        for (const id of await unpricedIngredientIds(db, userId, row.baseVersionId, depth + 1)) ids.add(id);
      }
    } else if (row.ingredientId) {
      ids.add(row.ingredientId);
    }
  }
  if (depth > 0) return [...ids];
  const prices = await currentPrices(db, userId, [...ids]);
  return [...ids].filter((id) => !prices.has(id));
}

export type AutoEstimateResult = { ok: true; saved: number } | { ok: false; reason: "budget" | "failed" };

/**
 * Estimation automatique : les ingrédients sans prix reçoivent un prix estimé par l'IA,
 * enregistré comme « à confirmer » (jamais par-dessus un prix existant). La personne le
 * confirme ou le corrige dans « Ingrédients ».
 */
export async function estimateMissingPrices(
  db: Database,
  ai: LlmAdapter,
  userId: string,
  versionId: string,
  languageCode = "fr",
): Promise<AutoEstimateResult> {
  const ids = await unpricedIngredientIds(db, userId, versionId);
  let saved = 0;
  for (let i = 0; i < ids.length; i += PRICE_ESTIMATE_MAX_ITEMS) {
    const result = await estimatePrices(
      db,
      ai,
      userId,
      ids.slice(i, i + PRICE_ESTIMATE_MAX_ITEMS),
      languageCode,
    );
    if (!result.ok) {
      if (result.reason === "empty") continue;
      return saved > 0 ? { ok: true, saved } : { ok: false, reason: result.reason };
    }
    for (const proposal of result.proposals) {
      const outcome = await savePrice(db, {
        userId,
        ingredientId: proposal.ingredientId,
        price: proposal.price,
        source: "ai_estimate",
      });
      if (outcome.ok) saved += 1;
    }
  }
  return { ok: true, saved };
}

/** Estimation des prix manquants : une erreur n'empêche jamais la recette d'être prête. */
export async function autoEstimate(
  db: Database,
  ai: LlmAdapter,
  userId: string,
  versionId: string,
  language: string,
): Promise<void> {
  try {
    await estimateMissingPrices(db, ai, userId, versionId, language);
  } catch (error) {
    console.error(`Prix non estimés : ${error instanceof Error ? error.message : String(error)}`);
  }
}
