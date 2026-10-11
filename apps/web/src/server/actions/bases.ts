"use server";

import { getLocale } from "next-intl/server";
import { z } from "zod";
import { audit } from "../audit";
import { getDb } from "../db";
import { type StartBaseResult, startBaseGeneration } from "../generation/base";
import { dispatchGeneration } from "../generation/dispatch";
import { requireUser } from "../session";

/**
 * « Faire maison » : lance la rédaction de la recette maison d'un ingrédient
 * acheté tout prêt. Gratuit (hors quota), borné par le plafond de budget IA.
 */
export async function makeHomemadeAction(lineId: string): Promise<StartBaseResult> {
  const session = await requireUser(await getLocale());
  if (!z.uuid().safeParse(lineId).success) return { ok: false, reason: "not_found" };
  const db = getDb();
  const result = await startBaseGeneration(db, { userId: session.user.id, lineId });
  if (result.ok) {
    await audit(db, {
      actorId: session.user.id,
      action: "recipe.base.generate",
      entity: "recipe_ingredient",
      entityId: lineId,
    });
    await dispatchGeneration(result.generationId);
  }
  return result;
}
