"use server";

import { getLocale } from "next-intl/server";
import { z } from "zod";
import { audit } from "../audit";
import { getDb } from "../db";
import { dispatchGeneration } from "../generation/dispatch";
import { type StartImageResult, startImageGeneration } from "../images/generate";
import { requireUser } from "../session";

/** Lance la photo de la recette (1 crédit d'image, rendu si la génération échoue). */
export async function generateImageAction(recipeId: string): Promise<StartImageResult> {
  const session = await requireUser(await getLocale());
  if (!z.uuid().safeParse(recipeId).success) return { ok: false, reason: "not_found" };
  const db = getDb();
  const result = await startImageGeneration(db, { userId: session.user.id, recipeId });
  if (result.ok) {
    await audit(db, {
      actorId: session.user.id,
      action: "recipe.image.generate",
      entity: "recipe",
      entityId: recipeId,
    });
    await dispatchGeneration(result.generationId);
  }
  return result;
}
