/**
 * Préparations « faites maison » (« Mes bases ») : à partir d'un ingrédient
 * acheté tout prêt dans une recette (pains bao, pâte feuilletée…), l'IA rédige
 * la recette maison, dimensionnée pour couvrir le besoin. La base est enregistrée
 * comme une recette à part (kind = « base ») et liée à la ligne d'ingrédient :
 * son coût remplace alors le prix du produit acheté.
 *
 * Générer une base est gratuit (hors quota de recettes) mais reste borné par le
 * plafond de budget IA global.
 */
import {
  AiGenerationError,
  BASE_PROMPT_VERSION,
  type BaseRequest,
  baseProblems,
  baseToRecipe,
  buildBasePrompt,
  generatedBaseSchema,
  type LlmAdapter,
  RECIPE_GENERATION_ESTIMATE_USD_MICROS,
} from "@culinova/ai";
import { isWithinBudget } from "@culinova/core";
import type { Database } from "@culinova/db";
import * as s from "@culinova/db/schema";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { getAiBudgetCap, getAiSpend, recordAiSpend } from "../quotas";
import { saveRecipeVersion } from "./persist";
import type { GenerationOutcome } from "./run";

export type BaseRefusal = "not_found" | "already_homemade" | "busy" | "budget";
export type StartBaseResult = { ok: true; generationId: string } | { ok: false; reason: BaseRefusal };

const LINE_REF = (lineId: string) => `line:${lineId}`;

/** Ligne d'ingrédient de la version active d'une recette de la personne, avec sa recette. */
async function ownedLine(db: Database, userId: string, lineId: string) {
  const [row] = await db
    .select({
      line: s.recipeIngredients,
      recipeId: s.recipes.id,
      kind: s.recipes.kind,
      language: s.recipes.originalLanguage,
      currentVersionId: s.recipes.currentVersionId,
      versionName: s.recipeVersions.name,
      versionDescription: s.recipeVersions.description,
      cuisine: s.recipeVersions.cuisineLabel,
    })
    .from(s.recipeIngredients)
    .innerJoin(s.recipeVersions, eq(s.recipeVersions.id, s.recipeIngredients.recipeVersionId))
    .innerJoin(s.recipes, eq(s.recipes.id, s.recipeVersions.recipeId))
    .where(
      and(eq(s.recipeIngredients.id, lineId), eq(s.recipes.ownerId, userId), isNull(s.recipes.deletedAt)),
    );
  return row ?? null;
}

/** Génération de base en cours pour cette ligne, s'il y en a une. */
export async function pendingBaseGeneration(db: Database, lineId: string): Promise<string | null> {
  const [row] = await db
    .select({ id: s.aiGenerations.id })
    .from(s.aiGenerations)
    .where(
      and(
        eq(s.aiGenerations.kind, "base"),
        eq(s.aiGenerations.inputRef, LINE_REF(lineId)),
        inArray(s.aiGenerations.status, ["queued", "running"]),
      ),
    );
  return row?.id ?? null;
}

export async function startBaseGeneration(
  db: Database,
  input: { userId: string; lineId: string },
): Promise<StartBaseResult> {
  const row = await ownedLine(db, input.userId, input.lineId);
  // Seules les lignes de la version active d'un plat peuvent être faites maison.
  if (!row || row.kind !== "dish" || row.currentVersionId !== row.line.recipeVersionId) {
    return { ok: false, reason: "not_found" };
  }
  if (row.line.baseRecipeId) return { ok: false, reason: "already_homemade" };
  if (row.line.quantityG === null) return { ok: false, reason: "not_found" };
  if (await pendingBaseGeneration(db, input.lineId)) return { ok: false, reason: "busy" };

  const [cap, spent] = await Promise.all([getAiBudgetCap(db), getAiSpend(db)]);
  if (!isWithinBudget(spent, cap, RECIPE_GENERATION_ESTIMATE_USD_MICROS))
    return { ok: false, reason: "budget" };

  const [generation] = await db
    .insert(s.aiGenerations)
    .values({
      userId: input.userId,
      kind: "base",
      status: "queued",
      inputRef: LINE_REF(input.lineId),
      recipeId: row.recipeId,
    })
    .returning({ id: s.aiGenerations.id });
  return { ok: true, generationId: generation!.id };
}

export async function runBaseGeneration(
  db: Database,
  ai: LlmAdapter,
  generation: typeof s.aiGenerations.$inferSelect,
): Promise<GenerationOutcome> {
  const lineId = generation.inputRef?.startsWith("line:") ? generation.inputRef.slice(5) : null;
  try {
    const row = lineId && generation.userId ? await ownedLine(db, generation.userId, lineId) : null;
    if (!row || row.line.quantityG === null) throw new Error("Ligne d'ingrédient introuvable");
    const neededG = Math.round(Number(row.line.quantityG));
    const request: BaseRequest = {
      name: row.line.label,
      neededG,
      neededDisplay:
        row.line.displayQuantity !== null && row.line.displayUnit
          ? { quantity: Number(row.line.displayQuantity), unit: row.line.displayUnit }
          : null,
      recipe: { name: row.versionName, description: row.versionDescription, cuisine: row.cuisine },
      language: row.language === "en" ? "en" : "fr",
    };

    const result = await ai.generateStructured({
      promptId: BASE_PROMPT_VERSION,
      ...buildBasePrompt(request),
      schema: generatedBaseSchema,
      validate: (base) => baseProblems(base, neededG),
      maxOutputTokens: 32_000,
    });
    const base = result.data;

    const saved = await db.transaction(async (tx) => {
      const version = await saveRecipeVersion(tx, {
        ownerId: generation.userId!,
        // Une base est une fournée : elle est enregistrée « pour 1 », dimensionnée par son poids.
        recipe: baseToRecipe(base, row.cuisine),
        languageCode: request.language,
        momentId: null,
        generationParamsId: null,
        changeNote: null,
        kind: "base",
        yieldG: base.yieldG,
      });
      const [created] = await tx
        .insert(s.baseRecipes)
        .values({
          recipeId: version.recipeId,
          yieldG: Math.round(base.yieldG),
          yieldDisplayQuantity: base.yieldDisplayQuantity === null ? null : String(base.yieldDisplayQuantity),
          yieldDisplayUnit: base.yieldDisplayUnit,
          shelfLifeH: base.shelfLifeHours === null ? null : Math.round(base.shelfLifeHours),
        })
        .returning({ id: s.baseRecipes.id });
      // La ligne de la recette principale utilise désormais la base (son coût remplace le prix d'achat).
      await tx
        .update(s.recipeIngredients)
        .set({ baseRecipeId: created!.id })
        .where(eq(s.recipeIngredients.id, row.line.id));
      await tx
        .update(s.aiGenerations)
        .set({
          status: "succeeded",
          finishedAt: new Date(),
          output: { baseRecipeId: created!.id, recipeId: version.recipeId, base },
          provider: result.usage.provider,
          model: result.usage.model,
          promptVersion: BASE_PROMPT_VERSION,
          tokensIn: result.usage.inputTokens,
          tokensOut: result.usage.outputTokens,
          costUsdMicros: result.usage.costUsdMicros,
          attempts: result.usage.attempts,
        })
        .where(eq(s.aiGenerations.id, generation.id));
      return version;
    });
    await recordAiSpend(db, result.usage.costUsdMicros);
    return saved ? "succeeded" : "failed";
  } catch (error) {
    const usage = error instanceof AiGenerationError ? error.usage : undefined;
    const code = error instanceof AiGenerationError ? error.code : "unexpected";
    console.error(
      `Base maison ${generation.id} en échec : ${error instanceof Error ? error.message : String(error)}`,
    );
    await db
      .update(s.aiGenerations)
      .set({
        status: "failed",
        error: `${code} : ${error instanceof Error ? error.message : String(error)}`.slice(0, 2000),
        provider: usage?.provider ?? null,
        model: usage?.model ?? null,
        costUsdMicros: usage?.costUsdMicros ?? 0,
        attempts: usage?.attempts ?? 0,
        finishedAt: new Date(),
      })
      .where(eq(s.aiGenerations.id, generation.id));
    if (usage?.costUsdMicros) await recordAiSpend(db, usage.costUsdMicros);
    return "failed";
  }
}
