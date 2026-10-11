"use server";

import * as s from "@culinova/db/schema";
import { and, eq } from "drizzle-orm";
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

/**
 * État d'une génération de base, sans rafraîchir la page côté serveur :
 * la page recharge elle-même la recette quand la base est prête.
 */
export async function baseGenerationStatusAction(
  generationId: string,
): Promise<"queued" | "running" | "succeeded" | "failed" | null> {
  const session = await requireUser(await getLocale());
  if (!z.uuid().safeParse(generationId).success) return null;
  const [row] = await getDb()
    .select({ status: s.aiGenerations.status })
    .from(s.aiGenerations)
    .where(
      and(
        eq(s.aiGenerations.id, generationId),
        eq(s.aiGenerations.userId, session.user.id),
        eq(s.aiGenerations.kind, "base"),
      ),
    );
  return row?.status ?? null;
}
