/**
 * Lancement d'une génération : vérifications (paramètres, budget global,
 * quota), verrouillage du brouillon, puis création de la demande. Le quota
 * est consommé ici, de façon atomique, et rendu si la génération échoue.
 */
import { isWithinBudget, nextResetDate, type QuotaMetric } from "@culinova/core";
import { RECIPE_GENERATION_ESTIMATE_USD_MICROS, type RecipeRequest } from "@culinova/ai";
import type { Database } from "@culinova/db";
import * as s from "@culinova/db/schema";
import { and, eq, inArray } from "drizzle-orm";
import { missingFields, parseWizardState, type WizardState } from "@/lib/wizard";
import { consumeQuota, getAiBudgetCap, getAiSpend, releaseQuota } from "../quotas";
import { loadCulinaryReference } from "./reference";
import { buildRecipeRequest } from "./request";

export type StartRefusal =
  | { ok: false; reason: "not_found" | "busy" | "incomplete" | "budget" }
  | {
      ok: false;
      reason: "quota";
      metric: QuotaMetric;
      limit: number | null;
      resetsOn: { year: number; month: number; day: 1 } | null;
    };

export type StartResult = { ok: true; generationId: string } | StartRefusal;

async function loadProfile(db: Database, userId: string) {
  const [profile] = await db.select().from(s.userProfiles).where(eq(s.userProfiles.userId, userId));
  return {
    diets: profile?.diets ?? [],
    allergens: profile?.allergens ?? [],
    dislikedIngredients: profile?.dislikedIngredients ?? [],
  };
}

export async function budgetAllows(db: Database): Promise<boolean> {
  const [cap, spent] = await Promise.all([getAiBudgetCap(db), getAiSpend(db)]);
  return isWithinBudget(spent, cap, RECIPE_GENERATION_ESTIMATE_USD_MICROS);
}

/** Identifiants des éléments choisis, pour la table generation_params. */
async function resolveIds(db: Database, state: WizardState) {
  const one = async <T extends { id: string }>(rows: Promise<T[]>) => (await rows)[0]?.id ?? null;
  const [momentId, influenceId, regionId, countryId, cuisines, styles] = await Promise.all([
    state.momentCode
      ? one(
          db
            .select({ id: s.mealMoments.id })
            .from(s.mealMoments)
            .where(eq(s.mealMoments.code, state.momentCode)),
        )
      : null,
    state.influenceCode && state.influenceCode !== "none"
      ? one(
          db
            .select({ id: s.culinaryInfluences.id })
            .from(s.culinaryInfluences)
            .where(eq(s.culinaryInfluences.code, state.influenceCode)),
        )
      : null,
    state.regionCode
      ? one(
          db
            .select({ id: s.culinaryRegions.id })
            .from(s.culinaryRegions)
            .where(eq(s.culinaryRegions.code, state.regionCode)),
        )
      : null,
    state.countryIso
      ? one(
          db
            .select({ id: s.countries.id })
            .from(s.countries)
            .where(eq(s.countries.isoCode, state.countryIso)),
        )
      : null,
    state.cuisineCodes.length
      ? db.select({ id: s.cuisines.id }).from(s.cuisines).where(inArray(s.cuisines.code, state.cuisineCodes))
      : Promise.resolve([]),
    state.styleCode
      ? db
          .select({ id: s.culinaryStyles.id })
          .from(s.culinaryStyles)
          .where(eq(s.culinaryStyles.code, state.styleCode))
      : Promise.resolve([]),
  ]);
  return {
    momentId,
    influenceId,
    regionId,
    countryId,
    cuisineIds: cuisines.map((c) => c.id),
    styleIds: styles.map((st) => st.id),
  };
}

export function quotaRefusal(metric: QuotaMetric, limit: number | null, now: Date): StartRefusal {
  return {
    ok: false,
    reason: "quota",
    metric,
    limit,
    resetsOn: metric === "regenerations" ? null : nextResetDate(now),
  };
}

export async function startRecipeGeneration(
  db: Database,
  input: { userId: string; draftId: string; now?: Date },
): Promise<StartResult> {
  const now = input.now ?? new Date();
  const [draft] = await db
    .select()
    .from(s.recipeDrafts)
    .where(and(eq(s.recipeDrafts.id, input.draftId), eq(s.recipeDrafts.userId, input.userId)));
  if (!draft) return { ok: false, reason: "not_found" };
  if (draft.status === "generating") return { ok: false, reason: "busy" };

  const state = parseWizardState(draft.state);
  if (missingFields(state).length > 0) return { ok: false, reason: "incomplete" };
  const reference = await loadCulinaryReference(db, "fr");
  let request: RecipeRequest;
  try {
    request = buildRecipeRequest(state, reference, await loadProfile(db, input.userId));
  } catch {
    return { ok: false, reason: "incomplete" };
  }
  if (!(await budgetAllows(db))) return { ok: false, reason: "budget" };

  // Verrou : un seul lancement à la fois pour ce brouillon.
  const locked = await db
    .update(s.recipeDrafts)
    .set({ status: "generating", error: null })
    .where(and(eq(s.recipeDrafts.id, draft.id), inArray(s.recipeDrafts.status, ["editing", "failed"])))
    .returning({ id: s.recipeDrafts.id });
  if (locked.length === 0) return { ok: false, reason: "busy" };

  const quota = await consumeQuota(db, { userId: input.userId, metric: "recipes", now });
  if (!quota.allowed) {
    await db.update(s.recipeDrafts).set({ status: "editing" }).where(eq(s.recipeDrafts.id, draft.id));
    return quotaRefusal("recipes", quota.limit, now);
  }

  try {
    const ids = await resolveIds(db, state);
    const [params] = await db
      .insert(s.generationParams)
      .values({
        ...ids,
        languageCode: state.language,
        mode: state.mode!,
        inputText: state.input,
        servings: state.servings,
        constraints: request.constraints,
        snapshot: request as unknown as Record<string, unknown>,
      })
      .returning({ id: s.generationParams.id });
    const [generation] = await db
      .insert(s.aiGenerations)
      .values({
        userId: input.userId,
        kind: "recipe",
        status: "queued",
        inputRef: `draft:${draft.id}`,
        draftId: draft.id,
        generationParamsId: params!.id,
      })
      .returning({ id: s.aiGenerations.id });
    await db
      .update(s.recipeDrafts)
      .set({ generationId: generation!.id })
      .where(eq(s.recipeDrafts.id, draft.id));
    if (ids.cuisineIds.length) {
      await db
        .insert(s.userCuisinePrefs)
        .values(
          ids.cuisineIds.map((cuisineId) => ({
            userId: input.userId,
            cuisineId,
            kind: "recent" as const,
            usedAt: now,
          })),
        )
        .onConflictDoUpdate({
          target: [s.userCuisinePrefs.userId, s.userCuisinePrefs.cuisineId, s.userCuisinePrefs.kind],
          set: { usedAt: now },
        });
    }
    return { ok: true, generationId: generation!.id };
  } catch (error) {
    await releaseQuota(db, { userId: input.userId, metric: "recipes", now });
    await db
      .update(s.recipeDrafts)
      .set({ status: "failed", error: "start_failed" })
      .where(eq(s.recipeDrafts.id, draft.id));
    throw error;
  }
}

/** Régénère le texte d'une recette (nouvelle version), dans la limite de 2 par recette. */
export async function startRegeneration(
  db: Database,
  input: {
    userId: string;
    recipeId: string;
    instruction?: string | null;
    now?: Date;
    /** « edit » : modification ciblée de la recette actuelle (consigne obligatoire). */
    mode?: "regeneration" | "edit";
  },
): Promise<StartResult> {
  const now = input.now ?? new Date();
  const mode = input.mode ?? "regeneration";
  if (mode === "edit" && !input.instruction?.trim()) return { ok: false, reason: "incomplete" };
  const [recipe] = await db
    .select({ id: s.recipes.id, versionId: s.recipes.currentVersionId })
    .from(s.recipes)
    .where(and(eq(s.recipes.id, input.recipeId), eq(s.recipes.ownerId, input.userId)));
  if (!recipe?.versionId) return { ok: false, reason: "not_found" };
  const [version] = await db
    .select({ paramsId: s.recipeVersions.generationParamsId })
    .from(s.recipeVersions)
    .where(eq(s.recipeVersions.id, recipe.versionId));
  if (!version?.paramsId) return { ok: false, reason: "not_found" };

  const running = await db
    .select({ id: s.aiGenerations.id })
    .from(s.aiGenerations)
    .where(
      and(eq(s.aiGenerations.recipeId, recipe.id), inArray(s.aiGenerations.status, ["queued", "running"])),
    );
  if (running.length > 0) return { ok: false, reason: "busy" };
  if (!(await budgetAllows(db))) return { ok: false, reason: "budget" };

  const quota = await consumeQuota(db, {
    userId: input.userId,
    metric: "regenerations",
    recipeId: recipe.id,
    now,
  });
  if (!quota.allowed) return quotaRefusal("regenerations", quota.limit, now);

  const [generation] = await db
    .insert(s.aiGenerations)
    .values({
      userId: input.userId,
      kind: mode,
      status: "queued",
      inputRef: `recipe:${recipe.id}`,
      recipeId: recipe.id,
      generationParamsId: version.paramsId,
      instruction: input.instruction?.trim().slice(0, 500) || null,
    })
    .returning({ id: s.aiGenerations.id });
  return { ok: true, generationId: generation!.id };
}
