"use server";

import * as s from "@culinova/db/schema";
import { and, eq, isNull } from "drizzle-orm";
import { getLocale } from "next-intl/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { audit } from "../audit";
import { getDb } from "../db";
import { dispatchGeneration } from "../generation/dispatch";
import { type SaveResult, saveDraft, startNewDraft } from "../generation/drafts";
import { type StartResult, startRecipeGeneration, startRegeneration } from "../generation/start";
import { loadRecipeView, type RecipeView } from "../generation/view";
import { requireUser } from "../session";

async function currentUser() {
  return requireUser(await getLocale());
}

const uuid = z.uuid();

export async function saveDraftAction(
  draftId: string,
  state: unknown,
  clientUpdatedAt: string,
): Promise<SaveResult> {
  const session = await currentUser();
  const when = new Date(clientUpdatedAt);
  if (!uuid.safeParse(draftId).success || Number.isNaN(when.getTime()))
    return { ok: false, reason: "not_found" };
  // Une horloge de navigateur en avance ne doit pas bloquer les sauvegardes suivantes.
  const clamped = when.getTime() > Date.now() + 60_000 ? new Date() : when;
  return saveDraft(getDb(), { userId: session.user.id, draftId, state, clientUpdatedAt: clamped });
}

export async function newDraftAction(): Promise<{ draftId: string }> {
  const session = await currentUser();
  const locale = (await getLocale()) === "en" ? "en" : "fr";
  const draft = await startNewDraft(getDb(), session.user.id, locale);
  return { draftId: draft.id };
}

export async function startGenerationAction(draftId: string): Promise<StartResult> {
  const session = await currentUser();
  if (!uuid.safeParse(draftId).success) return { ok: false, reason: "not_found" };
  const result = await startRecipeGeneration(getDb(), { userId: session.user.id, draftId });
  if (result.ok) await dispatchGeneration(result.generationId);
  return result;
}

export interface DraftStatus {
  status: s.DraftStatus;
  error: string | null;
  recipeId: string | null;
}

export async function draftStatusAction(draftId: string): Promise<DraftStatus | null> {
  const session = await currentUser();
  if (!uuid.safeParse(draftId).success) return null;
  const [draft] = await getDb()
    .select({ status: s.recipeDrafts.status, error: s.recipeDrafts.error, recipeId: s.recipeDrafts.recipeId })
    .from(s.recipeDrafts)
    .where(and(eq(s.recipeDrafts.id, draftId), eq(s.recipeDrafts.userId, session.user.id)));
  return draft ?? null;
}

export async function recipeViewAction(recipeId: string, versionNo?: number): Promise<RecipeView | null> {
  const session = await currentUser();
  if (!uuid.safeParse(recipeId).success) return null;
  if (versionNo !== undefined && !(Number.isInteger(versionNo) && versionNo > 0)) return null;
  return loadRecipeView(getDb(), recipeId, session.user.id, versionNo);
}

/** Fait d'une version précédente la version active de la recette (rien n'est supprimé). */
export async function restoreVersionAction(recipeId: string, versionNo: number): Promise<RecipeView | null> {
  const session = await currentUser();
  if (!uuid.safeParse(recipeId).success || !(Number.isInteger(versionNo) && versionNo > 0)) return null;
  const db = getDb();
  const [target] = await db
    .select({ id: s.recipeVersions.id, before: s.recipes.currentVersionId })
    .from(s.recipeVersions)
    .innerJoin(s.recipes, eq(s.recipes.id, s.recipeVersions.recipeId))
    .where(
      and(
        eq(s.recipeVersions.recipeId, recipeId),
        eq(s.recipeVersions.versionNo, versionNo),
        eq(s.recipes.ownerId, session.user.id),
        isNull(s.recipes.deletedAt),
      ),
    );
  if (!target) return null;
  await db.update(s.recipes).set({ currentVersionId: target.id }).where(eq(s.recipes.id, recipeId));
  await audit(db, {
    actorId: session.user.id,
    action: "recipe.version.restore",
    entity: "recipe",
    entityId: recipeId,
    before: { versionId: target.before },
    after: { versionId: target.id, versionNo },
  });
  revalidatePath("/app/recettes", "layout");
  return loadRecipeView(db, recipeId, session.user.id);
}

export async function regenerateAction(recipeId: string, instruction: string | null): Promise<StartResult> {
  const session = await currentUser();
  if (!uuid.safeParse(recipeId).success) return { ok: false, reason: "not_found" };
  const result = await startRegeneration(getDb(), { userId: session.user.id, recipeId, instruction });
  if (result.ok) await dispatchGeneration(result.generationId);
  return result;
}

/** Modification par instruction (« remplace le poulet par du poisson ») : nouvelle version ciblée. */
export async function editRecipeAction(recipeId: string, instruction: string): Promise<StartResult> {
  const session = await currentUser();
  if (!uuid.safeParse(recipeId).success) return { ok: false, reason: "not_found" };
  const result = await startRegeneration(getDb(), {
    userId: session.user.id,
    recipeId,
    instruction: String(instruction ?? "").slice(0, 500),
    mode: "edit",
  });
  if (result.ok) await dispatchGeneration(result.generationId);
  return result;
}

export async function generationStatusAction(
  generationId: string,
): Promise<"queued" | "running" | "succeeded" | "failed" | null> {
  const session = await currentUser();
  if (!uuid.safeParse(generationId).success) return null;
  const [row] = await getDb()
    .select({ status: s.aiGenerations.status })
    .from(s.aiGenerations)
    .where(and(eq(s.aiGenerations.id, generationId), eq(s.aiGenerations.userId, session.user.id)));
  if (row?.status === "succeeded") revalidatePath("/app/recettes", "layout");
  return row?.status ?? null;
}

/** Cause d'échec d'une génération, sous forme de code affichable (ex. « truncated »). */
export async function generationFailureAction(generationId: string): Promise<string> {
  const session = await currentUser();
  if (!uuid.safeParse(generationId).success) return "unexpected";
  const [row] = await getDb()
    .select({ error: s.aiGenerations.error })
    .from(s.aiGenerations)
    .where(and(eq(s.aiGenerations.id, generationId), eq(s.aiGenerations.userId, session.user.id)));
  const code = /^([a-z_]+) : /.exec(row?.error ?? "")?.[1];
  return code ?? "unexpected";
}

/** Détail technique d'un échec, montré aux administrateurs seulement (pour le diagnostic). */
export async function generationFailureDetailAction(generationId: string): Promise<string | null> {
  const session = await currentUser();
  if (session.user.role !== "admin" || !uuid.safeParse(generationId).success) return null;
  const [row] = await getDb()
    .select({ error: s.aiGenerations.error })
    .from(s.aiGenerations)
    .where(and(eq(s.aiGenerations.id, generationId), eq(s.aiGenerations.userId, session.user.id)));
  return row?.error?.slice(0, 500) ?? null;
}

/** Ajoute ou retire une cuisine des favoris (suggestions du wizard). */
export async function toggleFavoriteCuisineAction(cuisineCode: string): Promise<boolean> {
  const session = await currentUser();
  const db = getDb();
  const [cuisine] = await db
    .select({ id: s.cuisines.id })
    .from(s.cuisines)
    .where(eq(s.cuisines.code, cuisineCode));
  if (!cuisine) return false;
  const key = and(
    eq(s.userCuisinePrefs.userId, session.user.id),
    eq(s.userCuisinePrefs.cuisineId, cuisine.id),
    eq(s.userCuisinePrefs.kind, "favorite"),
  );
  const removed = await db.delete(s.userCuisinePrefs).where(key).returning();
  if (removed.length > 0) return false;
  await db
    .insert(s.userCuisinePrefs)
    .values({ userId: session.user.id, cuisineId: cuisine.id, kind: "favorite" });
  return true;
}
