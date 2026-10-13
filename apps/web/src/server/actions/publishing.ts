"use server";

import { getLocale } from "next-intl/server";
import { z } from "zod";
import { getDb } from "../db";
import {
  cancelPublication,
  PLATFORMS,
  type Platform,
  type PublicationStatus,
  publicationStatuses,
  queuePublication,
  reportPublication,
} from "../publishing";
import { requireUser } from "../session";
import { setShowcase } from "../showcase";

const uuid = z.uuid();

async function admin() {
  const session = await requireUser(await getLocale());
  return session.user.role === "admin" && !session.impersonatedBy ? session : null;
}

/** Met la recette dans la file de l'agent (« à publier ») pour les réseaux choisis. */
export async function queuePublicationAction(
  recipeId: string,
  platforms: Platform[],
): Promise<PublicationStatus[] | null> {
  const session = await admin();
  const chosen = platforms.filter((p): p is Platform => (PLATFORMS as readonly string[]).includes(p));
  if (!session || !uuid.safeParse(recipeId).success) return null;
  const db = getDb();
  if (!(await queuePublication(db, session.user.id, recipeId, chosen))) return null;
  return publicationStatuses(db, recipeId);
}

export async function cancelPublicationAction(recipeId: string): Promise<PublicationStatus[] | null> {
  const session = await admin();
  if (!session || !uuid.safeParse(recipeId).success) return null;
  const db = getDb();
  if (!(await cancelPublication(db, session.user.id, recipeId))) return null;
  return publicationStatuses(db, recipeId);
}

/** Publication faite à la main : l'administrateur la marque comme publiée. */
export async function markPublishedAction(
  recipeId: string,
  platform: Platform,
  postUrl: string,
): Promise<PublicationStatus[] | null> {
  const session = await admin();
  const url = postUrl.trim() ? z.url().max(500).safeParse(postUrl.trim()) : null;
  if (
    !session ||
    !uuid.safeParse(recipeId).success ||
    !PLATFORMS.includes(platform) ||
    url?.success === false
  ) {
    return null;
  }
  const db = getDb();
  const ok = await reportPublication(
    db,
    recipeId,
    platform,
    { status: "published", postUrl: url?.data ?? null },
    { actorId: session.user.id, via: "admin" },
  );
  return ok ? publicationStatuses(db, recipeId) : null;
}

/** Montre (ou retire) la photo de la recette dans la vitrine de la page d'accueil. */
export async function setShowcaseAction(recipeId: string, shown: boolean): Promise<boolean | null> {
  const session = await admin();
  if (!session || !uuid.safeParse(recipeId).success) return null;
  return (await setShowcase(getDb(), session.user.id, recipeId, shown)) ? shown : null;
}
