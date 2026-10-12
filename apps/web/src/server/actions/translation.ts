"use server";

import { createLlmAdapter } from "@culinova/ai";
import { getLocale } from "next-intl/server";
import { z } from "zod";
import { audit } from "../audit";
import { getDb } from "../db";
import { requireUser } from "../session";
import { type TranslateResult, translateRecipe, validateTranslation } from "../translation";

/** Traduit la version active dans l'autre langue (proposition à valider, hors quotas). */
export async function translateRecipeAction(recipeId: string): Promise<TranslateResult> {
  const session = await requireUser(await getLocale());
  if (!z.uuid().safeParse(recipeId).success) return { ok: false, reason: "not_found" };
  const db = getDb();
  const result = await translateRecipe(
    db,
    createLlmAdapter(process.env, { effort: "low" }),
    session.user.id,
    recipeId,
  );
  if (result.ok) {
    await audit(db, {
      actorId: session.user.id,
      action: "recipe.translation.generate",
      entity: "recipe",
      entityId: recipeId,
    });
  }
  return result;
}

export async function validateTranslationAction(recipeId: string): Promise<boolean> {
  const session = await requireUser(await getLocale());
  if (!z.uuid().safeParse(recipeId).success) return false;
  const db = getDb();
  const ok = await validateTranslation(db, session.user.id, recipeId);
  if (ok) {
    await audit(db, {
      actorId: session.user.id,
      action: "recipe.translation.validate",
      entity: "recipe",
      entityId: recipeId,
    });
  }
  return ok;
}
