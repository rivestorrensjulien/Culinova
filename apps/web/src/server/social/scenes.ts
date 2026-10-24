/**
 * Préparation des vidéos de l'agent par Claude, demandée par l'agent : découpage en scènes de la
 * vidéo réaliste (prompt video.scenes@1) et format court et couches (video.layers@2 : vue éclatée, coupe, vue du dessus ou geste).
 * Gratuit, borné par le plafond de budget IA, mis en cache par version de recette.
 */
import { isWithinBudget } from "@culinova/core";
import {
  AiGenerationError,
  buildVideoLayersPrompt,
  buildVideoScenesPrompt,
  type LlmAdapter,
  VIDEO_LAYERS_PROMPT_VERSION,
  VIDEO_SCENES_PROMPT_VERSION,
  type VideoLayers,
  videoLayersSchema,
  type VideoScenes,
  videoScenesProblems,
  videoScenesSchema,
} from "@culinova/ai";
import type { Database } from "@culinova/db";
import * as s from "@culinova/db/schema";
import { and, desc, eq } from "drizzle-orm";
import type { z } from "zod";
import { loadRecipeView, type RecipeView } from "../generation/view";
import { adminRecipe } from "../publishing";
import { getAiBudgetCap, getAiSpend, recordAiSpend } from "../quotas";
import { amountText, stepPlainText } from "../recipe-text";
import { videoJobs } from "./videos";

const COST_USD_MICROS = 80_000;

type Refusal = { ok: false; reason: "not_found" | "budget" | "failed" };
type Generated<T> = { ok: true; data: T; cached: boolean } | Refusal;

function platingText(plating: RecipeView["plating"]): string | null {
  if (!plating) return null;
  const parts = [plating.plate, plating.positioning, plating.sauce, plating.garnish, plating.finish];
  return plating.description || parts.filter(Boolean).join(" ; ") || null;
}

function recipeInput(view: RecipeView) {
  return {
    name: view.name,
    ingredients: view.ingredients.map((i) => ({ label: i.label, amount: amountText(i) })),
    steps: view.steps.map((step) => stepPlainText(view, step.action)),
    plating: platingText(view.plating),
  };
}

/** Génération mise en cache par version de recette (relancée si `fresh`). */
async function cachedGeneration<S extends z.ZodType>(
  db: Database,
  ai: LlmAdapter,
  args: {
    recipeId: string;
    ownerId: string;
    versionId: string;
    promptVersion: string;
    schema: S;
    build: (view: RecipeView) => { system: string; user: string };
    validate?: (data: z.infer<S>) => string[];
    fresh?: boolean;
  },
): Promise<Generated<z.infer<S>>> {
  const inputRef = `version:${args.versionId}`;
  if (!args.fresh) {
    const [previous] = await db
      .select({ output: s.aiGenerations.output })
      .from(s.aiGenerations)
      .where(
        and(
          eq(s.aiGenerations.kind, "video_scenes"),
          eq(s.aiGenerations.status, "succeeded"),
          eq(s.aiGenerations.inputRef, inputRef),
          eq(s.aiGenerations.promptVersion, args.promptVersion),
        ),
      )
      .orderBy(desc(s.aiGenerations.createdAt))
      .limit(1);
    const parsed = args.schema.safeParse(previous?.output);
    if (parsed.success && (args.validate?.(parsed.data) ?? []).length === 0) {
      return { ok: true, data: parsed.data, cached: true };
    }
  }

  const [cap, spent] = await Promise.all([getAiBudgetCap(db), getAiSpend(db)]);
  if (!isWithinBudget(spent, cap, COST_USD_MICROS)) return { ok: false, reason: "budget" };
  const view = await loadRecipeView(db, args.recipeId, args.ownerId);
  if (!view) return { ok: false, reason: "not_found" };

  const [generation] = await db
    .insert(s.aiGenerations)
    .values({
      userId: args.ownerId,
      kind: "video_scenes",
      status: "running",
      inputRef,
      recipeId: args.recipeId,
      promptVersion: args.promptVersion,
      startedAt: new Date(),
    })
    .returning({ id: s.aiGenerations.id });
  try {
    const result = await ai.generateStructured({
      promptId: args.promptVersion,
      ...args.build(view),
      schema: args.schema,
      validate: args.validate,
      maxOutputTokens: 8_000,
    });
    await db
      .update(s.aiGenerations)
      .set({
        status: "succeeded",
        output: result.data,
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
    return { ok: true, data: result.data, cached: false };
  } catch (error) {
    const usage = error instanceof AiGenerationError ? error.usage : undefined;
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

async function adminRecipeOwner(db: Database, recipeId: string) {
  const recipe = await adminRecipe(db, recipeId);
  const [owner] = await db
    .select({ ownerId: s.recipes.ownerId })
    .from(s.recipes)
    .where(eq(s.recipes.id, recipeId));
  return recipe?.versionId && owner ? { versionId: recipe.versionId, ownerId: owner.ownerId } : null;
}

export async function videoScenes(
  db: Database,
  ai: LlmAdapter,
  recipeId: string,
  options: { fresh?: boolean } = {},
): Promise<Generated<VideoScenes>> {
  const recipe = await adminRecipeOwner(db, recipeId);
  const [job] = await videoJobs(db, "", { recipeId });
  if (!recipe || !job) return { ok: false, reason: "not_found" };
  return cachedGeneration(db, ai, {
    recipeId,
    ...recipe,
    promptVersion: VIDEO_SCENES_PROMPT_VERSION,
    schema: videoScenesSchema,
    build: (view) => buildVideoScenesPrompt({ ...recipeInput(view), hook: job.hook, shots: job.shots }),
    validate: (scenes) => videoScenesProblems(scenes, job.shots.length),
    fresh: options.fresh,
  });
}

export async function videoLayers(
  db: Database,
  ai: LlmAdapter,
  recipeId: string,
  options: { fresh?: boolean } = {},
): Promise<Generated<VideoLayers>> {
  const recipe = await adminRecipeOwner(db, recipeId);
  if (!recipe) return { ok: false, reason: "not_found" };
  return cachedGeneration(db, ai, {
    recipeId,
    ...recipe,
    promptVersion: VIDEO_LAYERS_PROMPT_VERSION,
    schema: videoLayersSchema,
    build: (view) => buildVideoLayersPrompt(recipeInput(view)),
    fresh: options.fresh,
  });
}
