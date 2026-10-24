/**
 * Planification automatique branchée sur le vrai service : photo lancée comme le bouton
 * « Générer la photo » (crédit d'image de l'administrateur), e-mail aux administrateurs.
 */
import type { Database } from "@culinova/db";
import * as s from "@culinova/db/schema";
import { renderPublicationsToApproveEmail, sendEmail } from "@culinova/emails";
import { and, eq, isNull } from "drizzle-orm";
import { audit } from "../audit";
import { appUrl, localePrefix } from "../auth";
import { dispatchGeneration } from "../generation/dispatch";
import { startImageGeneration } from "../images/generate";
import { type PlannedDay, planUpcoming } from "./autoplan";

const dayLabel = (iso: string) =>
  new Date(iso).toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "Europe/Paris",
  });

async function startPhoto(db: Database, ownerId: string, recipeId: string): Promise<boolean> {
  const result = await startImageGeneration(db, { userId: ownerId, recipeId });
  if (!result.ok) return false;
  await audit(db, { actorId: null, action: "recipe.image.generate", entity: "recipe", entityId: recipeId });
  await dispatchGeneration(result.generationId);
  return true;
}

async function notify(db: Database, planned: PlannedDay[]): Promise<void> {
  const admins = await db
    .select({ email: s.users.email })
    .from(s.users)
    .where(and(eq(s.users.role, "admin"), isNull(s.users.suspendedAt)));
  const email = await renderPublicationsToApproveEmail({
    items: planned.map((p) => ({ day: dayLabel(p.day), name: p.recipeName, photoStarted: p.photoStarted })),
    url: `${appUrl()}${localePrefix("fr")}/admin/reseaux#calendrier`,
  });
  for (const admin of admins) {
    await sendEmail({ to: admin.email, ...email, tag: "publications-to-approve" }).catch((error: unknown) =>
      console.error(`E-mail de planification non envoyé : ${error instanceof Error ? error.message : error}`),
    );
  }
}

export function runAutoplan(db: Database): Promise<PlannedDay[]> {
  return planUpcoming(db, { startPhoto, notify });
}
