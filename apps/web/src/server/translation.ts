/**
 * Versions linguistiques d'une recette : traduction culinaire proposée par l'IA,
 * rattachée à une version, validée par la personne. Quand la recette change
 * (nouvelle version), la traduction précédente est signalée « à mettre à jour ».
 * Gratuit (hors quotas), borné par le plafond de budget IA.
 */
import {
  AiGenerationError,
  buildTranslatePrompt,
  type LlmAdapter,
  TRANSLATE_PROMPT_VERSION,
  type TranslationLanguage,
  translationProblems,
  translationSchema,
} from "@culinova/ai";
import { isWithinBudget, remapStepQuantityTokens } from "@culinova/core";
import type { Database } from "@culinova/db";
import * as s from "@culinova/db/schema";
import { and, desc, eq, isNull } from "drizzle-orm";
import { loadGeneratedRecipeWithIds } from "./generation/current-recipe";
import { getAiBudgetCap, getAiSpend, recordAiSpend } from "./quotas";

/** Coût maximal estimé d'une traduction (une recette complète en entrée et en sortie). */
const TRANSLATE_COST_USD_MICROS = 100_000;

export interface TranslationPayload {
  name: string;
  description: string;
  cuisineLabel: string;
  fusionLabel: string | null;
  equipment: string[];
  tips: string[];
  /** Par ligne d'ingrédient (identifiant de la ligne). */
  ingredients: Record<string, { label: string; displayUnit: string | null }>;
  /** Par étape (identifiant de l'étape), jetons de quantité pointant vers les lignes. */
  steps: Record<string, { action: string; expectedResult: string | null }>;
  platingDescription: string;
}

export interface TranslationState {
  /** Langue proposée à la traduction (l'autre langue que l'originale). */
  target: TranslationLanguage;
  /** Traduction de la version affichée, si elle existe. */
  current: { payload: TranslationPayload; validated: boolean } | null;
  /** Numéro de la version déjà traduite quand la version affichée ne l'est pas encore. */
  outdatedVersionNo: number | null;
}

export type TranslateRefusal = "not_found" | "budget" | "failed";
export type TranslateResult = { ok: true } | { ok: false; reason: TranslateRefusal };

export function targetLanguageOf(original: string): TranslationLanguage {
  return original === "en" ? "fr" : "en";
}

async function ownedRecipe(db: Database, userId: string, recipeId: string) {
  const [row] = await db
    .select({
      id: s.recipes.id,
      language: s.recipes.originalLanguage,
      versionId: s.recipes.currentVersionId,
      versionNo: s.recipeVersions.versionNo,
    })
    .from(s.recipes)
    .innerJoin(s.recipeVersions, eq(s.recipeVersions.id, s.recipes.currentVersionId))
    .where(and(eq(s.recipes.id, recipeId), eq(s.recipes.ownerId, userId), isNull(s.recipes.deletedAt)));
  return row ?? null;
}

/** Traduit la version active dans l'autre langue ; la traduction est à valider. */
export async function translateRecipe(
  db: Database,
  ai: LlmAdapter,
  userId: string,
  recipeId: string,
): Promise<TranslateResult> {
  const recipe = await ownedRecipe(db, userId, recipeId);
  if (!recipe?.versionId) return { ok: false, reason: "not_found" };
  const loaded = await loadGeneratedRecipeWithIds(db, recipe.versionId);
  if (!loaded) return { ok: false, reason: "not_found" };
  const [cap, spent] = await Promise.all([getAiBudgetCap(db), getAiSpend(db)]);
  if (!isWithinBudget(spent, cap, TRANSLATE_COST_USD_MICROS)) return { ok: false, reason: "budget" };

  const target = targetLanguageOf(recipe.language);
  const [generation] = await db
    .insert(s.aiGenerations)
    .values({
      userId,
      kind: "translation",
      status: "running",
      recipeId,
      inputRef: `version:${recipe.versionId}:${target}`,
      promptVersion: TRANSLATE_PROMPT_VERSION,
      startedAt: new Date(),
    })
    .returning({ id: s.aiGenerations.id });

  try {
    const result = await ai.generateStructured({
      promptId: TRANSLATE_PROMPT_VERSION,
      ...buildTranslatePrompt(loaded.recipe, target),
      schema: translationSchema,
      validate: (data) => translationProblems(data, loaded.recipe),
      maxOutputTokens: 16_000,
    });
    const data = result.data;
    const refToLine = new Map(loaded.recipe.ingredients.map((i, index) => [i.ref, loaded.lineIds[index]!]));
    const payload: TranslationPayload = {
      name: data.name,
      description: data.description,
      cuisineLabel: data.cuisineLabel,
      fusionLabel: data.fusionLabel,
      equipment: data.equipment,
      tips: data.tips,
      ingredients: Object.fromEntries(
        data.ingredients.flatMap((i) => {
          const lineId = refToLine.get(i.ref);
          return lineId ? [[lineId, { label: i.name, displayUnit: i.displayUnit }]] : [];
        }),
      ),
      steps: Object.fromEntries(
        data.steps.map((step, index) => [
          loaded.stepIds[index]!,
          { action: remapStepQuantityTokens(step.action, refToLine), expectedResult: step.expectedResult },
        ]),
      ),
      platingDescription: data.platingDescription,
    };
    await db
      .insert(s.recipeTranslations)
      .values({
        recipeVersionId: recipe.versionId,
        languageCode: target,
        payload: payload as unknown as Record<string, unknown>,
        sourceVersionNo: recipe.versionNo,
        status: "up_to_date",
        validatedAt: null,
      })
      .onConflictDoUpdate({
        target: [s.recipeTranslations.recipeVersionId, s.recipeTranslations.languageCode],
        set: {
          payload: payload as unknown as Record<string, unknown>,
          status: "up_to_date",
          validatedAt: null,
          updatedAt: new Date(),
        },
      });
    await db
      .update(s.aiGenerations)
      .set({
        status: "succeeded",
        finishedAt: new Date(),
        provider: result.usage.provider,
        model: result.usage.model,
        tokensIn: result.usage.inputTokens,
        tokensOut: result.usage.outputTokens,
        costUsdMicros: result.usage.costUsdMicros,
        attempts: result.usage.attempts,
      })
      .where(eq(s.aiGenerations.id, generation!.id));
    await recordAiSpend(db, result.usage.costUsdMicros);
    return { ok: true };
  } catch (error) {
    const usage = error instanceof AiGenerationError ? error.usage : undefined;
    console.error(`Traduction en échec : ${error instanceof Error ? error.message : String(error)}`);
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

/** La personne a relu la traduction de la version active : elle est validée. */
export async function validateTranslation(db: Database, userId: string, recipeId: string): Promise<boolean> {
  const recipe = await ownedRecipe(db, userId, recipeId);
  if (!recipe?.versionId) return false;
  const rows = await db
    .update(s.recipeTranslations)
    .set({ validatedAt: new Date(), updatedAt: new Date() })
    .where(
      and(
        eq(s.recipeTranslations.recipeVersionId, recipe.versionId),
        eq(s.recipeTranslations.languageCode, targetLanguageOf(recipe.language)),
      ),
    )
    .returning({ id: s.recipeTranslations.id });
  return rows.length > 0;
}

export async function loadTranslationState(
  db: Database,
  recipeId: string,
  versionId: string,
  originalLanguage: string,
): Promise<TranslationState> {
  const target = targetLanguageOf(originalLanguage);
  const [own] = await db
    .select()
    .from(s.recipeTranslations)
    .where(
      and(eq(s.recipeTranslations.recipeVersionId, versionId), eq(s.recipeTranslations.languageCode, target)),
    );
  if (own) {
    return {
      target,
      current: { payload: own.payload as unknown as TranslationPayload, validated: own.validatedAt !== null },
      outdatedVersionNo: null,
    };
  }
  const [previous] = await db
    .select({ versionNo: s.recipeTranslations.sourceVersionNo })
    .from(s.recipeTranslations)
    .innerJoin(s.recipeVersions, eq(s.recipeVersions.id, s.recipeTranslations.recipeVersionId))
    .where(and(eq(s.recipeVersions.recipeId, recipeId), eq(s.recipeTranslations.languageCode, target)))
    .orderBy(desc(s.recipeTranslations.updatedAt))
    .limit(1);
  return { target, current: null, outdatedVersionNo: previous?.versionNo ?? null };
}
