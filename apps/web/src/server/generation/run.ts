/**
 * Exécution d'une génération (appelée par la tâche Inngest, ou directement en
 * l'absence d'Inngest). Mesure le coût, enregistre la recette, puis génère le
 * contenu social. En cas d'échec, le quota est rendu et l'erreur affichée.
 */
import {
  AiGenerationError,
  buildRecipePrompt,
  buildRegenerationPrompt,
  buildSocialPrompt,
  type GeneratedRecipe,
  generatedRecipeSchema,
  type LlmAdapter,
  RECIPE_PROMPT_VERSION,
  RECIPE_REGENERATE_PROMPT_VERSION,
  type RecipeRequest,
  recipeProblems,
  SOCIAL_PROMPT_VERSION,
  socialContentSchema,
  socialProblems,
} from "@culinova/ai";
import type { Database } from "@culinova/db";
import * as s from "@culinova/db/schema";
import { and, eq, inArray } from "drizzle-orm";
import { recordAiSpend, releaseQuota } from "../quotas";
import { runImageGeneration } from "../images/generate";
import { runBaseGeneration } from "./base";
import { saveRecipeVersion, saveSocialContent } from "./persist";

export type GenerationOutcome = "succeeded" | "failed" | "skipped";

/** Message compréhensible pour la personne, selon la cause de l'échec. */
export function userFacingError(error: unknown): string {
  if (error instanceof AiGenerationError) return error.code;
  return "unexpected";
}

export async function runGeneration(
  db: Database,
  ai: LlmAdapter,
  generationId: string,
): Promise<GenerationOutcome> {
  // Passage en cours (idempotent : une relance ne refait pas une génération terminée).
  const [generation] = await db
    .update(s.aiGenerations)
    .set({ status: "running", startedAt: new Date() })
    .where(and(eq(s.aiGenerations.id, generationId), inArray(s.aiGenerations.status, ["queued", "running"])))
    .returning();
  if (generation?.kind === "base") return runBaseGeneration(db, ai, generation);
  if (generation?.kind === "image") return runImageGeneration(db, ai, generation);
  if (!generation || (generation.kind !== "recipe" && generation.kind !== "regeneration")) return "skipped";

  const [params] = generation.generationParamsId
    ? await db
        .select()
        .from(s.generationParams)
        .where(eq(s.generationParams.id, generation.generationParamsId))
    : [];
  const request = params?.snapshot as unknown as RecipeRequest | undefined;
  const isRegeneration = generation.kind === "regeneration";

  try {
    if (!request || !generation.userId) throw new Error("Paramètres de génération introuvables");

    let prompt = buildRecipePrompt(request);
    if (isRegeneration) {
      const [current] = await db
        .select({ name: s.recipeVersions.name, description: s.recipeVersions.description })
        .from(s.recipes)
        .innerJoin(s.recipeVersions, eq(s.recipeVersions.id, s.recipes.currentVersionId))
        .where(eq(s.recipes.id, generation.recipeId!));
      prompt = buildRegenerationPrompt(
        request,
        { name: current?.name ?? "", description: current?.description ?? "" },
        generation.instruction,
      );
    }

    const promptVersion = isRegeneration ? RECIPE_REGENERATE_PROMPT_VERSION : RECIPE_PROMPT_VERSION;
    const result = await ai.generateStructured({
      promptId: promptVersion,
      ...prompt,
      schema: generatedRecipeSchema,
      validate: (recipe) => recipeProblems(recipe, request.servings),
      // Réflexion comprise : une recette riche (15 ingrédients, 15 étapes) dépasse vite 16 000 jetons.
      maxOutputTokens: 32_000,
    });
    const recipe: GeneratedRecipe = result.data;

    // 1. La recette est enregistrée (elle n'est pas perdue si la suite échoue)…
    const saved = await db.transaction(async (tx) => {
      const version = await saveRecipeVersion(tx, {
        ownerId: generation.userId!,
        recipeId: isRegeneration ? generation.recipeId : null,
        recipe,
        languageCode: request.language,
        momentId: params!.momentId,
        generationParamsId: params!.id,
        changeNote: isRegeneration ? (generation.instruction ?? "Régénération") : null,
      });
      await tx
        .update(s.aiGenerations)
        .set({
          recipeId: version.recipeId,
          output: { recipe, versionId: version.versionId },
          provider: result.usage.provider,
          model: result.usage.model,
          promptVersion,
          tokensIn: result.usage.inputTokens,
          tokensOut: result.usage.outputTokens,
          costUsdMicros: result.usage.costUsdMicros,
          attempts: result.usage.attempts,
        })
        .where(eq(s.aiGenerations.id, generation.id));
      return version;
    });
    await recordAiSpend(db, result.usage.costUsdMicros);

    // 2. … puis le contenu social (facultatif) …
    await generateSocial(db, ai, {
      userId: generation.userId,
      versionId: saved.versionId,
      recipe,
      language: request.language,
    });

    // 3. … et seulement alors, la génération est annoncée comme terminée.
    await db
      .update(s.aiGenerations)
      .set({ status: "succeeded", finishedAt: new Date() })
      .where(eq(s.aiGenerations.id, generation.id));
    if (generation.draftId) {
      await db
        .update(s.recipeDrafts)
        .set({ status: "done", recipeId: saved.recipeId, error: null })
        .where(eq(s.recipeDrafts.id, generation.draftId));
    }
    return "succeeded";
  } catch (error) {
    const usage = error instanceof AiGenerationError ? error.usage : undefined;
    console.error(
      `Génération ${generation.id} en échec : ${error instanceof Error ? error.message : String(error)}`,
    );
    await db
      .update(s.aiGenerations)
      .set({
        status: "failed",
        // « code : détail » — le code est affiché à la personne, le détail sert au diagnostic.
        error: `${userFacingError(error)} : ${error instanceof Error ? error.message : String(error)}`.slice(
          0,
          2000,
        ),
        provider: usage?.provider ?? null,
        model: usage?.model ?? null,
        tokensIn: usage?.inputTokens ?? null,
        tokensOut: usage?.outputTokens ?? null,
        costUsdMicros: usage?.costUsdMicros ?? 0,
        attempts: usage?.attempts ?? 0,
        finishedAt: new Date(),
      })
      .where(eq(s.aiGenerations.id, generation.id));
    if (usage?.costUsdMicros) await recordAiSpend(db, usage.costUsdMicros);
    // Une génération ratée ne doit pas coûter de quota à la personne.
    if (generation.userId) {
      await releaseQuota(db, {
        userId: generation.userId,
        metric: isRegeneration ? "regenerations" : "recipes",
        recipeId: generation.recipeId ?? undefined,
        now: generation.createdAt,
      });
    }
    if (generation.draftId) {
      await db
        .update(s.recipeDrafts)
        .set({ status: "failed", error: userFacingError(error) })
        .where(eq(s.recipeDrafts.id, generation.draftId));
    }
    return "failed";
  }
}

/** Contenu social : facultatif, son échec n'annule pas la recette. */
async function generateSocial(
  db: Database,
  ai: LlmAdapter,
  input: { userId: string; versionId: string; recipe: GeneratedRecipe; language: "fr" | "en" },
): Promise<void> {
  const [row] = await db
    .insert(s.aiGenerations)
    .values({
      userId: input.userId,
      kind: "social",
      status: "running",
      inputRef: `version:${input.versionId}`,
      startedAt: new Date(),
    })
    .returning({ id: s.aiGenerations.id });
  try {
    const result = await ai.generateStructured({
      promptId: SOCIAL_PROMPT_VERSION,
      ...buildSocialPrompt(input.recipe, input.language),
      schema: socialContentSchema,
      // Script TikTok en anglais : « Hook » au lieu d'« Accroche » ; le contrôle ne s'applique qu'au français.
      ...(input.language === "fr" ? { validate: socialProblems } : {}),
      maxOutputTokens: 4000,
    });
    await saveSocialContent(db, input.versionId, input.language, result.data);
    await db
      .update(s.aiGenerations)
      .set({
        status: "succeeded",
        output: result.data,
        provider: result.usage.provider,
        model: result.usage.model,
        promptVersion: SOCIAL_PROMPT_VERSION,
        tokensIn: result.usage.inputTokens,
        tokensOut: result.usage.outputTokens,
        costUsdMicros: result.usage.costUsdMicros,
        attempts: result.usage.attempts,
        finishedAt: new Date(),
      })
      .where(eq(s.aiGenerations.id, row!.id));
    await recordAiSpend(db, result.usage.costUsdMicros);
  } catch (error) {
    const usage = error instanceof AiGenerationError ? error.usage : undefined;
    console.error(`Contenu social non généré : ${error instanceof Error ? error.message : String(error)}`);
    await db
      .update(s.aiGenerations)
      .set({
        status: "failed",
        error: error instanceof Error ? error.message.slice(0, 2000) : String(error),
        costUsdMicros: usage?.costUsdMicros ?? 0,
        finishedAt: new Date(),
      })
      .where(eq(s.aiGenerations.id, row!.id));
    if (usage?.costUsdMicros) await recordAiSpend(db, usage.costUsdMicros);
  }
}
