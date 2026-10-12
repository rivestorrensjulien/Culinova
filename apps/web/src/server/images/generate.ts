/**
 * Photo d'une recette : Claude rédige un prompt photographique d'après le dressage,
 * FLUX1.1 [pro] (fal.ai) génère une image HD carrée, puis les 4 formats (1:1, 4:5,
 * 9:16, 16:9) sont recadrés à partir d'elle, sans génération supplémentaire.
 * Une image consomme 1 crédit du quota mensuel d'images (rendu en cas d'échec).
 */
import {
  AiGenerationError,
  buildImagePrompt,
  createImageAdapter,
  fallbackImagePrompt,
  IMAGE_COST_USD_MICROS,
  IMAGE_FORMATS,
  IMAGE_PROMPT_VERSION,
  IMAGE_SOURCE_SIZE,
  type ImageAdapter,
  type ImagePromptInput,
  imagePromptProblems,
  imagePromptSchema,
  type LlmAdapter,
} from "@culinova/ai";
import { centeredCrop, isWithinBudget } from "@culinova/core";
import type { Database } from "@culinova/db";
import * as s from "@culinova/db/schema";
import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { consumeQuota, getAiBudgetCap, getAiSpend, recordAiSpend, releaseQuota } from "../quotas";
import { createImageStorage, type ImageStorage, imagesAvailable } from "./storage";

export { imagesAvailable };

export type ImageRefusal = "not_found" | "busy" | "budget" | "quota" | "unavailable";
type ImageRefused = { ok: false; reason: ImageRefusal; limit?: number | null };
export type StartImageResult = { ok: true; generationId: string } | ImageRefused;

export async function startImageGeneration(
  db: Database,
  input: { userId: string; recipeId: string; now?: Date; env?: Record<string, string | undefined> },
): Promise<StartImageResult> {
  const [recipe] = await db
    .select({ id: s.recipes.id, versionId: s.recipes.currentVersionId })
    .from(s.recipes)
    .where(
      and(eq(s.recipes.id, input.recipeId), eq(s.recipes.ownerId, input.userId), isNull(s.recipes.deletedAt)),
    );
  if (!recipe?.versionId) return { ok: false, reason: "not_found" };
  if (!imagesAvailable(input.env)) return { ok: false, reason: "unavailable" };

  const running = await db
    .select({ id: s.aiGenerations.id })
    .from(s.aiGenerations)
    .where(
      and(
        eq(s.aiGenerations.recipeId, recipe.id),
        eq(s.aiGenerations.kind, "image"),
        inArray(s.aiGenerations.status, ["queued", "running"]),
      ),
    );
  if (running.length > 0) return { ok: false, reason: "busy" };

  const [cap, spent] = await Promise.all([getAiBudgetCap(db), getAiSpend(db)]);
  if (!isWithinBudget(spent, cap, IMAGE_COST_USD_MICROS + 20_000)) return { ok: false, reason: "budget" };

  const quota = await consumeQuota(db, {
    userId: input.userId,
    metric: "images",
    ...(input.now ? { now: input.now } : {}),
  });
  if (!quota.allowed) return { ok: false, reason: "quota", limit: quota.limit };

  const [generation] = await db
    .insert(s.aiGenerations)
    .values({
      userId: input.userId,
      kind: "image",
      status: "queued",
      inputRef: `version:${recipe.versionId}`,
      recipeId: recipe.id,
      promptVersion: IMAGE_PROMPT_VERSION,
    })
    .returning({ id: s.aiGenerations.id });
  return { ok: true, generationId: generation!.id };
}

/** Données de la version utiles au prompt photo. */
async function promptInput(db: Database, versionId: string): Promise<ImagePromptInput | null> {
  const [version] = await db
    .select({
      name: s.recipeVersions.name,
      description: s.recipeVersions.description,
      cuisine: s.recipeVersions.cuisineLabel,
      plating: s.recipeVersions.plating,
      moment: s.mealMomentTranslations.name,
    })
    .from(s.recipeVersions)
    .leftJoin(
      s.mealMomentTranslations,
      and(
        eq(s.mealMomentTranslations.entityId, s.recipeVersions.momentId),
        eq(s.mealMomentTranslations.languageCode, "fr"),
      ),
    )
    .where(eq(s.recipeVersions.id, versionId));
  if (!version) return null;
  const ingredients = await db
    .select({ label: s.recipeIngredients.label })
    .from(s.recipeIngredients)
    .where(eq(s.recipeIngredients.recipeVersionId, versionId))
    .orderBy(asc(s.recipeIngredients.sortOrder));
  return {
    name: version.name,
    description: version.description,
    cuisine: version.cuisine,
    moment: version.moment ?? null,
    ingredients: ingredients.map((i) => i.label),
    plating: (version.plating as ImagePromptInput["plating"]) ?? null,
  };
}

/** Image source : téléchargée chez le fournisseur, ou dessinée (mode factice). */
async function download(url: string, size: number, fetchImpl: typeof fetch): Promise<Buffer> {
  if (url.startsWith("fake://")) {
    return sharp({
      create: { width: size, height: size, channels: 3, background: { r: 196, g: 120, b: 74 } },
    })
      .jpeg({ quality: 80 })
      .toBuffer();
  }
  const response = await fetchImpl(url, { signal: AbortSignal.timeout(60_000) });
  if (!response.ok) throw new Error(`Téléchargement de l'image impossible (${response.status})`);
  return Buffer.from(await response.arrayBuffer());
}

export interface ImageDeps {
  images?: ImageAdapter;
  storage?: ImageStorage;
  fetchImpl?: typeof fetch;
}

export async function runImageGeneration(
  db: Database,
  llm: LlmAdapter,
  generation: typeof s.aiGenerations.$inferSelect,
  deps: ImageDeps = {},
): Promise<"succeeded" | "failed"> {
  const versionId = generation.inputRef?.startsWith("version:") ? generation.inputRef.slice(8) : null;
  let promptCost = 0;
  try {
    if (!versionId || !generation.userId) throw new Error("Version introuvable");
    const input = await promptInput(db, versionId);
    if (!input) throw new Error("Version introuvable");
    const images = deps.images ?? createImageAdapter();
    const storage = deps.storage ?? createImageStorage();

    // 1. Prompt photo rédigé par Claude d'après le dressage (repli : gabarit simple).
    let prompt = fallbackImagePrompt(input);
    try {
      const result = await llm.generateStructured({
        promptId: IMAGE_PROMPT_VERSION,
        ...buildImagePrompt(input),
        schema: imagePromptSchema,
        validate: imagePromptProblems,
        maxOutputTokens: 4_000,
      });
      prompt = result.data.prompt.trim();
      promptCost = result.usage.costUsdMicros;
    } catch (error) {
      if (error instanceof AiGenerationError) promptCost = error.usage?.costUsdMicros ?? 0;
      console.error(`Prompt photo par défaut : ${error instanceof Error ? error.message : String(error)}`);
    }

    // 2. Image HD carrée, puis recadrages.
    const generated = await images.generate({ prompt, width: IMAGE_SOURCE_SIZE, height: IMAGE_SOURCE_SIZE });
    const source = await download(generated.url, IMAGE_SOURCE_SIZE, deps.fetchImpl ?? fetch);
    const meta = await sharp(source).metadata();
    const width = meta.width ?? generated.width;
    const height = meta.height ?? generated.height;

    const sourceId = randomUUID();
    const folder = `${generation.userId}/${versionId}/${sourceId}`;
    await storage.put(`${folder}/source.jpg`, source, "image/jpeg");
    const crops: Array<{
      format: (typeof IMAGE_FORMATS)[number];
      key: string;
      width: number;
      height: number;
    }> = [];
    for (const format of IMAGE_FORMATS) {
      const box = centeredCrop(width, height, format);
      const bytes = await sharp(source).extract(box).jpeg({ quality: 88, mozjpeg: true }).toBuffer();
      const key = `${folder}/${format.replace(":", "x")}.jpg`;
      await storage.put(key, bytes, "image/jpeg");
      crops.push({ format, key, width: box.width, height: box.height });
    }

    const totalCost = promptCost + generated.usage.costUsdMicros;
    await db.transaction(async (tx) => {
      await tx
        .update(s.recipeImages)
        .set({ isPrimary: false })
        .where(eq(s.recipeImages.recipeVersionId, versionId));
      await tx.insert(s.recipeImages).values({
        id: sourceId,
        recipeVersionId: versionId,
        format: "source",
        storageKey: `${folder}/source.jpg`,
        width,
        height,
        prompt,
        model: `${images.provider}:${images.model}`,
        isPrimary: true,
        status: "ready",
      });
      await tx.insert(s.recipeImages).values(
        crops.map((crop) => ({
          recipeVersionId: versionId,
          format: crop.format,
          sourceImageId: sourceId,
          storageKey: crop.key,
          width: crop.width,
          height: crop.height,
          status: "ready" as const,
        })),
      );
      await tx
        .update(s.aiGenerations)
        .set({
          status: "succeeded",
          finishedAt: new Date(),
          output: { sourceImageId: sourceId, prompt, seed: generated.seed },
          provider: generated.usage.provider,
          model: generated.usage.model,
          costUsdMicros: totalCost,
          attempts: generated.usage.attempts,
        })
        .where(eq(s.aiGenerations.id, generation.id));
    });
    await recordAiSpend(db, totalCost);
    return "succeeded";
  } catch (error) {
    const usage = error instanceof AiGenerationError ? error.usage : undefined;
    const code = error instanceof AiGenerationError ? error.code : "unexpected";
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Photo ${generation.id} en échec : ${message}`);
    const cost = promptCost + (usage?.costUsdMicros ?? 0);
    await db
      .update(s.aiGenerations)
      .set({
        status: "failed",
        error: `${code} : ${message}`.slice(0, 2000),
        costUsdMicros: cost,
        finishedAt: new Date(),
      })
      .where(eq(s.aiGenerations.id, generation.id));
    if (cost) await recordAiSpend(db, cost);
    // Une image ratée ne doit pas coûter de crédit à la personne.
    if (generation.userId) {
      await releaseQuota(db, { userId: generation.userId, metric: "images", now: generation.createdAt });
    }
    return "failed";
  }
}
