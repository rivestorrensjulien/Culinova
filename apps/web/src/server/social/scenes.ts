/**
 * Découpage en scènes de la vidéo réaliste d'une recette (prompt video.scenes@1) : demandé par
 * l'agent, gratuit, borné par le plafond de budget IA, mis en cache par version de recette.
 */
import { isWithinBudget } from "@culinova/core";
import {
  AiGenerationError,
  buildVideoScenesPrompt,
  type LlmAdapter,
  VIDEO_SCENES_PROMPT_VERSION,
  type VideoScenes,
  videoScenesProblems,
  videoScenesSchema,
} from "@culinova/ai";
import type { Database } from "@culinova/db";
import * as s from "@culinova/db/schema";
import { and, desc, eq } from "drizzle-orm";
import { loadRecipeView, type RecipeView } from "../generation/view";
import { adminRecipe } from "../publishing";
import { getAiBudgetCap, getAiSpend, recordAiSpend } from "../quotas";
import { amountText, stepPlainText } from "../recipe-text";
import { videoJobs } from "./videos";

const SCENES_COST_USD_MICROS = 80_000;

type ScenesRefusal = { ok: false; reason: "not_found" | "budget" | "failed" };
type ScenesResult = { ok: true; scenes: VideoScenes; cached: boolean } | ScenesRefusal;

function platingText(plating: RecipeView["plating"]): string | null {
  if (!plating) return null;
  const parts = [plating.plate, plating.positioning, plating.sauce, plating.garnish, plating.finish];
  return plating.description || parts.filter(Boolean).join(" ; ") || null;
}

export async function videoScenes(
  db: Database,
  ai: LlmAdapter,
  recipeId: string,
  options: { fresh?: boolean } = {},
): Promise<ScenesResult> {
  const recipe = await adminRecipe(db, recipeId);
  const [job] = await videoJobs(db, "", { recipeId });
  const [owner] = await db
    .select({ ownerId: s.recipes.ownerId })
    .from(s.recipes)
    .where(eq(s.recipes.id, recipeId));
  if (!recipe?.versionId || !job || !owner) return { ok: false, reason: "not_found" };
  const inputRef = `version:${recipe.versionId}`;

  if (!options.fresh) {
    const [previous] = await db
      .select({ output: s.aiGenerations.output })
      .from(s.aiGenerations)
      .where(
        and(
          eq(s.aiGenerations.kind, "video_scenes"),
          eq(s.aiGenerations.status, "succeeded"),
          eq(s.aiGenerations.inputRef, inputRef),
          eq(s.aiGenerations.promptVersion, VIDEO_SCENES_PROMPT_VERSION),
        ),
      )
      .orderBy(desc(s.aiGenerations.createdAt))
      .limit(1);
    const parsed = videoScenesSchema.safeParse(previous?.output);
    if (parsed.success && videoScenesProblems(parsed.data, job.shots.length).length === 0) {
      return { ok: true, scenes: parsed.data, cached: true };
    }
  }

  const [cap, spent] = await Promise.all([getAiBudgetCap(db), getAiSpend(db)]);
  if (!isWithinBudget(spent, cap, SCENES_COST_USD_MICROS)) return { ok: false, reason: "budget" };
  const view = await loadRecipeView(db, recipeId, owner.ownerId);
  if (!view) return { ok: false, reason: "not_found" };

  const [generation] = await db
    .insert(s.aiGenerations)
    .values({
      userId: owner.ownerId,
      kind: "video_scenes",
      status: "running",
      inputRef,
      recipeId,
      promptVersion: VIDEO_SCENES_PROMPT_VERSION,
      startedAt: new Date(),
    })
    .returning({ id: s.aiGenerations.id });
  try {
    const result = await ai.generateStructured({
      promptId: VIDEO_SCENES_PROMPT_VERSION,
      ...buildVideoScenesPrompt({
        name: view.name,
        ingredients: view.ingredients.map((i) => ({ label: i.label, amount: amountText(i) })),
        steps: view.steps.map((step) => stepPlainText(view, step.action)),
        plating: platingText(view.plating),
        hook: job.hook,
        shots: job.shots,
      }),
      schema: videoScenesSchema,
      validate: (scenes) => videoScenesProblems(scenes, job.shots.length),
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
    return { ok: true, scenes: result.data, cached: false };
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
