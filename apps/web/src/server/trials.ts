/**
 * Recette d'essai sans compte (P7, décision de Julien du 11/11) : depuis les pages publiques,
 * une personne sans invitation génère une première recette. Elle la lit à une adresse secrète
 * (/essai/<jeton>) et, si elle demande une invitation, la retrouve dans son espace à l'ouverture
 * de son compte.
 *
 * Garde-fous : 2 essais par jour et par connexion, un nombre maximal d'essais par jour pour tout
 * le site (réglage de l'administration), le plafond de budget IA, un champ piège anti-robots.
 * Pas de photo, de prix ni de contenu social : seulement la recette.
 */
import {
  AiGenerationError,
  buildRecipePrompt,
  type GeneratedRecipe,
  generatedRecipeSchema,
  type LlmAdapter,
  RECIPE_PROMPT_VERSION,
  type RecipeRequest,
  recipeProblems,
} from "@culinova/ai";
import type { Database } from "@culinova/db";
import * as s from "@culinova/db/schema";
import { and, eq, gt, isNull, lt, sql } from "drizzle-orm";
import { randomBytes } from "node:crypto";
import { platingText } from "@/components/recipe/format";
import { emptyWizardState, withHomeDefaults } from "@/lib/wizard";
import type { ActorContext } from "./access/users";
import { audit } from "./audit";
import { saveRecipeVersion } from "./generation/persist";
import { loadCulinaryReference } from "./generation/reference";
import { buildRecipeRequest } from "./generation/request";
import { budgetAllows, resolveIds } from "./generation/start";
import { recordAiSpend } from "./quotas";
import { isAllowed, RATE_RULES, recordAttempt } from "./rate-limit";
import { amountText, stepPlainText } from "./recipe-text";

export const TRIAL_PATH = "/essai";
/** Une recette d'essai non gardée est effacée au bout de 30 jours (politique de confidentialité). */
export const TRIAL_RETENTION_DAYS = 30;

export interface TrialSettings {
  enabled: boolean;
  /** Essais au plus sur 24 heures, pour tout le site. */
  dailyLimit: number;
}

export const TRIAL_DEFAULTS: TrialSettings = { enabled: true, dailyLimit: 30 };

export async function getTrialSettings(db: Database): Promise<TrialSettings> {
  const [row] = await db
    .select({ value: s.siteSettings.value })
    .from(s.siteSettings)
    .where(eq(s.siteSettings.key, s.SETTING_KEYS.trials));
  const value = (row?.value ?? {}) as Partial<TrialSettings>;
  return {
    enabled: typeof value.enabled === "boolean" ? value.enabled : TRIAL_DEFAULTS.enabled,
    dailyLimit:
      typeof value.dailyLimit === "number" && value.dailyLimit >= 0
        ? Math.floor(value.dailyLimit)
        : TRIAL_DEFAULTS.dailyLimit,
  };
}

export async function saveTrialSettings(
  db: Database,
  settings: TrialSettings,
  ctx: ActorContext,
): Promise<void> {
  const value = {
    enabled: settings.enabled,
    dailyLimit: Math.max(0, Math.min(1000, Math.floor(settings.dailyLimit))),
  };
  await db
    .insert(s.siteSettings)
    .values({ key: s.SETTING_KEYS.trials, value })
    .onConflictDoUpdate({ target: s.siteSettings.key, set: { value, updatedAt: new Date() } });
  await audit(db, { ...ctx, action: "settings.trials", entity: "site_setting", after: value });
}

/** Les essais sont-ils ouverts ? (boutons des pages publiques ; faux si la base ne répond pas). */
export async function trialsOpen(db: Database): Promise<boolean> {
  try {
    return (await getTrialSettings(db)).enabled;
  } catch {
    return false;
  }
}

export interface TrialInput {
  mode: "ingredients" | "idea";
  input: string;
  momentCode: string;
  servings: number;
  maxMinutes: number | null;
  language: "fr" | "en";
  /** Page publique d'où vient la personne (slug), facultatif. */
  sourceRecipe?: string | null;
}

export type StartTrialResult =
  | { ok: true; token: string; generationId: string }
  | { ok: false; reason: "closed" | "invalid" | "rate_limited" | "full" | "budget" };

function newToken(): string {
  return randomBytes(18).toString("base64url");
}

/** Essais lancés ces dernières 24 heures sur tout le site. */
export async function trialsLastDay(db: Database, now = new Date()): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(s.recipeTrials)
    .where(gt(s.recipeTrials.createdAt, new Date(now.getTime() - 86_400_000)));
  return row?.n ?? 0;
}

/** Lance une recette d'essai. La génération elle-même est confiée à `dispatchGeneration`. */
export async function startTrial(
  db: Database,
  input: TrialInput,
  meta: { ip: string | null; userAgent: string | null },
  now = new Date(),
): Promise<StartTrialResult> {
  const settings = await getTrialSettings(db);
  if (!settings.enabled) return { ok: false, reason: "closed" };

  const text = input.input.trim().slice(0, 300);
  if (text.length < 2 || input.servings < 1 || input.servings > 12) return { ok: false, reason: "invalid" };
  const reference = await loadCulinaryReference(db, "fr");
  if (!reference.moments.some((m) => m.code === input.momentCode)) return { ok: false, reason: "invalid" };

  const allowed = await isAllowed(db, "trial", [
    { by: { ip: meta.ip ?? undefined }, rule: RATE_RULES.trialPerIp },
  ]);
  if (!allowed) return { ok: false, reason: "rate_limited" };
  if ((await trialsLastDay(db, now)) >= settings.dailyLimit) return { ok: false, reason: "full" };
  if (!(await budgetAllows(db))) return { ok: false, reason: "budget" };

  // Même moteur que l'assistant court des particuliers : cuisine du quotidien, appareils courants.
  const state = withHomeDefaults({
    ...emptyWizardState(input.language),
    mode: input.mode,
    input: text,
    momentCode: input.momentCode,
    servings: input.servings,
    maxMinutes: input.maxMinutes,
  });
  let request: RecipeRequest;
  try {
    request = buildRecipeRequest(state, reference);
  } catch {
    return { ok: false, reason: "invalid" };
  }

  await recordAttempt(db, { kind: "trial", ip: meta.ip, success: true });
  const ids = await resolveIds(db, state);
  const [params] = await db
    .insert(s.generationParams)
    .values({
      ...ids,
      languageCode: state.language,
      mode: input.mode,
      inputText: text,
      servings: input.servings,
      constraints: request.constraints,
      snapshot: request as unknown as Record<string, unknown>,
    })
    .returning({ id: s.generationParams.id });
  const token = newToken();
  const [trial] = await db
    .insert(s.recipeTrials)
    .values({
      token,
      input: {
        mode: input.mode,
        input: text,
        momentCode: input.momentCode,
        servings: input.servings,
        maxMinutes: input.maxMinutes,
        language: input.language,
      },
      sourceRecipe: input.sourceRecipe?.slice(0, 80) || null,
    })
    .returning({ id: s.recipeTrials.id });
  const [generation] = await db
    .insert(s.aiGenerations)
    .values({
      userId: null,
      kind: "trial",
      status: "queued",
      inputRef: `trial:${trial!.id}`,
      generationParamsId: params!.id,
    })
    .returning({ id: s.aiGenerations.id });
  await db
    .update(s.recipeTrials)
    .set({ generationId: generation!.id })
    .where(eq(s.recipeTrials.id, trial!.id));
  return { ok: true, token, generationId: generation!.id };
}

/** Exécution d'une génération d'essai (appelée par `runGeneration`). */
export async function runTrialGeneration(
  db: Database,
  ai: LlmAdapter,
  generation: typeof s.aiGenerations.$inferSelect,
): Promise<"succeeded" | "failed"> {
  const [trial] = await db
    .select()
    .from(s.recipeTrials)
    .where(eq(s.recipeTrials.generationId, generation.id));
  const [params] = generation.generationParamsId
    ? await db
        .select()
        .from(s.generationParams)
        .where(eq(s.generationParams.id, generation.generationParamsId))
    : [];
  const request = params?.snapshot as unknown as RecipeRequest | undefined;
  try {
    if (!trial || !request) throw new Error("Essai introuvable");
    await db
      .update(s.recipeTrials)
      .set({ status: "running", updatedAt: new Date() })
      .where(eq(s.recipeTrials.id, trial.id));
    const result = await ai.generateStructured({
      promptId: RECIPE_PROMPT_VERSION,
      ...buildRecipePrompt(request),
      schema: generatedRecipeSchema,
      validate: (recipe) => recipeProblems(recipe, request.servings),
      maxOutputTokens: 32_000,
    });
    await db
      .update(s.recipeTrials)
      .set({ status: "succeeded", recipe: result.data, error: null, updatedAt: new Date() })
      .where(eq(s.recipeTrials.id, trial.id));
    await db
      .update(s.aiGenerations)
      .set({
        status: "succeeded",
        provider: result.usage.provider,
        model: result.usage.model,
        promptVersion: RECIPE_PROMPT_VERSION,
        tokensIn: result.usage.inputTokens,
        tokensOut: result.usage.outputTokens,
        costUsdMicros: result.usage.costUsdMicros,
        attempts: result.usage.attempts,
        finishedAt: new Date(),
      })
      .where(eq(s.aiGenerations.id, generation.id));
    await recordAiSpend(db, result.usage.costUsdMicros);
    return "succeeded";
  } catch (error) {
    const usage = error instanceof AiGenerationError ? error.usage : undefined;
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Essai ${generation.id} en échec : ${message}`);
    await db
      .update(s.aiGenerations)
      .set({
        status: "failed",
        error: message.slice(0, 2000),
        costUsdMicros: usage?.costUsdMicros ?? 0,
        attempts: usage?.attempts ?? 0,
        finishedAt: new Date(),
      })
      .where(eq(s.aiGenerations.id, generation.id));
    if (usage?.costUsdMicros) await recordAiSpend(db, usage.costUsdMicros);
    if (trial) {
      await db
        .update(s.recipeTrials)
        .set({ status: "failed", error: "unexpected", updatedAt: new Date() })
        .where(eq(s.recipeTrials.id, trial.id));
    }
    return "failed";
  }
}

/** Ce que montre la page d'essai : la recette lisible, sans aucune donnée de chiffrage. */
export interface TrialView {
  token: string;
  status: "queued" | "running" | "succeeded" | "failed";
  input: { mode: "ingredients" | "idea"; input: string; servings: number };
  claimed: boolean;
  recipe: {
    name: string;
    description: string;
    servings: number;
    difficulty: "easy" | "medium" | "hard";
    prepS: number;
    cookS: number;
    restS: number;
    ingredients: Array<{ label: string; amount: string }>;
    steps: Array<{ text: string; expected: string | null }>;
    plating: string | null;
    tips: string[];
    allergens: string[];
  } | null;
}

/** Ingrédients de la recette générée, sous la forme attendue par les textes de quantités. */
function readableIngredients(recipe: GeneratedRecipe) {
  return recipe.ingredients.map((i) => ({
    id: i.ref,
    label: i.name,
    dimension:
      i.unit === "g" ? ("mass" as const) : i.unit === "ml" ? ("volume" as const) : ("count" as const),
    quantity: i.quantity,
    displayQuantity: i.displayQuantity,
    displayUnit: i.displayUnit,
  }));
}

export function trialRecipeView(recipe: GeneratedRecipe): NonNullable<TrialView["recipe"]> {
  const ingredients = readableIngredients(recipe);
  return {
    name: recipe.name,
    description: recipe.description,
    servings: recipe.servings,
    difficulty: recipe.difficulty,
    prepS: recipe.prepTimeSeconds,
    cookS: recipe.cookTimeSeconds,
    restS: recipe.restTimeSeconds,
    ingredients: ingredients.map((i) => ({ label: i.label, amount: amountText(i) })),
    steps: recipe.steps.map((step) => ({
      text: stepPlainText({ ingredients }, step.action),
      expected: step.expectedResult,
    })),
    plating: recipe.plating.description ? platingText(recipe.plating) : null,
    tips: recipe.tips.filter((t) => t.trim()),
    allergens: recipe.allergens,
  };
}

export async function loadTrial(db: Database, token: string): Promise<TrialView | null> {
  if (!/^[A-Za-z0-9_-]{16,40}$/.test(token)) return null;
  const [trial] = await db.select().from(s.recipeTrials).where(eq(s.recipeTrials.token, token));
  if (!trial) return null;
  const parsed = trial.recipe ? generatedRecipeSchema.safeParse(trial.recipe) : null;
  return {
    token: trial.token,
    status: trial.status,
    input: { mode: trial.input.mode, input: trial.input.input, servings: trial.input.servings },
    claimed: trial.claimedBy !== null,
    recipe: parsed?.success ? trialRecipeView(parsed.data) : null,
  };
}

/** Identifiant d'un essai réussi et pas encore rattaché à un compte (demande d'invitation). */
export async function trialIdForRequest(
  db: Database,
  token: string | null | undefined,
): Promise<string | null> {
  if (!token || !/^[A-Za-z0-9_-]{16,40}$/.test(token)) return null;
  const [trial] = await db
    .select({ id: s.recipeTrials.id })
    .from(s.recipeTrials)
    .where(
      and(
        eq(s.recipeTrials.token, token),
        eq(s.recipeTrials.status, "succeeded"),
        isNull(s.recipeTrials.claimedBy),
      ),
    );
  return trial?.id ?? null;
}

/**
 * À la création du compte : la recette d'essai jointe à la demande d'invitation rejoint
 * l'espace de la personne, comme une recette générée (sans consommer son quota).
 */
export async function claimTrialForInvitation(
  db: Database,
  userId: string,
  invitationId: string,
): Promise<string | null> {
  const [row] = await db
    .select({ trial: s.recipeTrials })
    .from(s.invitationRequests)
    .innerJoin(s.recipeTrials, eq(s.recipeTrials.id, s.invitationRequests.trialId))
    .where(
      and(
        eq(s.invitationRequests.invitationId, invitationId),
        eq(s.recipeTrials.status, "succeeded"),
        isNull(s.recipeTrials.claimedBy),
      ),
    );
  const trial = row?.trial;
  const parsed = trial?.recipe ? generatedRecipeSchema.safeParse(trial.recipe) : null;
  if (!trial || !parsed?.success) return null;

  const [generation] = trial.generationId
    ? await db
        .select({ paramsId: s.aiGenerations.generationParamsId })
        .from(s.aiGenerations)
        .where(eq(s.aiGenerations.id, trial.generationId))
    : [];
  const [params] = generation?.paramsId
    ? await db
        .select({ id: s.generationParams.id, momentId: s.generationParams.momentId })
        .from(s.generationParams)
        .where(eq(s.generationParams.id, generation.paramsId))
    : [];

  return db.transaction(async (tx) => {
    const [claimed] = await tx
      .update(s.recipeTrials)
      .set({ claimedBy: userId, claimedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(s.recipeTrials.id, trial.id), isNull(s.recipeTrials.claimedBy)))
      .returning({ id: s.recipeTrials.id });
    if (!claimed) return null;
    const saved = await saveRecipeVersion(tx, {
      ownerId: userId,
      recipe: parsed.data,
      languageCode: trial.input.language,
      momentId: params?.momentId ?? null,
      generationParamsId: params?.id ?? null,
      changeNote: null,
    });
    if (trial.generationId) {
      await tx
        .update(s.aiGenerations)
        .set({ userId, recipeId: saved.recipeId })
        .where(eq(s.aiGenerations.id, trial.generationId));
    }
    return saved.recipeId;
  });
}

/** Essais des 7 derniers jours (administration : demandes d'invitation). */
export async function trialStats(db: Database, now = new Date()) {
  const since = new Date(now.getTime() - 7 * 86_400_000);
  const [row] = await db
    .select({
      total: sql<number>`count(*)::int`,
      succeeded: sql<number>`count(*) filter (where ${s.recipeTrials.status} = 'succeeded')::int`,
      requested: sql<number>`count(${s.invitationRequests.id})::int`,
      claimed: sql<number>`count(*) filter (where ${s.recipeTrials.claimedBy} is not null)::int`,
    })
    .from(s.recipeTrials)
    .leftJoin(s.invitationRequests, eq(s.invitationRequests.trialId, s.recipeTrials.id))
    .where(gt(s.recipeTrials.createdAt, since));
  return row ?? { total: 0, succeeded: 0, requested: 0, claimed: 0 };
}

/** Purge : essais de plus de 30 jours (ceux gardés vivent désormais dans le compte). */
export async function purgeTrials(db: Database, now = new Date()): Promise<number> {
  const limit = new Date(now.getTime() - TRIAL_RETENTION_DAYS * 86_400_000);
  const rows = await db
    .delete(s.recipeTrials)
    .where(lt(s.recipeTrials.createdAt, limit))
    .returning({ id: s.recipeTrials.id });
  return rows.length;
}

/** Statuts encore en cours (la page se rafraîchit d'elle-même). */
export const TRIAL_PENDING = ["queued", "running"] as const;
