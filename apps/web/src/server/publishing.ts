/**
 * Porte d'accès de l'agent de publication (projet séparé qui publie sur TikTok et
 * Instagram). Accès par clé secrète (AGENT_API_KEY), limité aux recettes des
 * administrateurs : textes Instagram et TikTok, photos par lien temporaire signé,
 * et statut de publication par recette et par réseau.
 */
import type { Database } from "@culinova/db";
import * as s from "@culinova/db/schema";
import { and, asc, desc, eq, inArray, isNull } from "drizzle-orm";
import { createHmac, timingSafeEqual } from "node:crypto";
import { audit } from "./audit";

export type Platform = s.PublicationPlatform;
export const PLATFORMS = s.PUBLICATION_PLATFORMS;

/** Durée de validité d'un lien de photo donné à l'agent. */
export const IMAGE_LINK_TTL_S = 60 * 60;

function agentKey(env: Record<string, string | undefined> = process.env): string | null {
  const key = env.AGENT_API_KEY?.trim();
  return key && key.length >= 32 ? key : null;
}

export function agentEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return agentKey(env) !== null;
}

/** Vérifie l'en-tête « Authorization: Bearer <clé> » (comparaison à temps constant). */
export function agentAuthorized(
  header: string | null,
  env: Record<string, string | undefined> = process.env,
) {
  const key = agentKey(env);
  if (!key || !header) return false;
  const expected = Buffer.from(`Bearer ${key}`);
  const given = Buffer.from(header);
  return expected.length === given.length && timingSafeEqual(expected, given);
}

function signature(
  imageId: string,
  expires: number,
  key: string,
  kind: "image" | "video" | "slide" = "image",
): string {
  return createHmac("sha256", key).update(`${kind}:${imageId}:${expires}`).digest("base64url");
}

/** Durée de validité d'un lien de vidéo donné à Instagram ou TikTok (qui la téléchargent). */
export const VIDEO_LINK_TTL_S = 6 * 60 * 60;

/** Lien temporaire vers une vidéo, que les réseaux téléchargent sans session (6 h). */
export function signedVideoPath(
  videoId: string,
  now = new Date(),
  env: Record<string, string | undefined> = process.env,
): string | null {
  const key = agentKey(env);
  if (!key) return null;
  const expires = Math.floor(now.getTime() / 1000) + VIDEO_LINK_TTL_S;
  return `/api/social/videos/${videoId}?expire=${expires}&signature=${signature(videoId, expires, key, "video")}`;
}

export function verifyVideoSignature(
  videoId: string,
  expires: string | null,
  given: string | null,
  now = new Date(),
  env: Record<string, string | undefined> = process.env,
): boolean {
  const key = agentKey(env);
  if (!key || !expires || !given || !/^\d+$/.test(expires)) return false;
  if (Number(expires) < Math.floor(now.getTime() / 1000)) return false;
  const expected = Buffer.from(signature(videoId, Number(expires), key, "video"));
  const provided = Buffer.from(given);
  return expected.length === provided.length && timingSafeEqual(expected, provided);
}

/** Lien temporaire vers une photo, utilisable sans session pendant une heure. */
export function signedImagePath(
  imageId: string,
  now = new Date(),
  env: Record<string, string | undefined> = process.env,
): string | null {
  const key = agentKey(env);
  if (!key) return null;
  const expires = Math.floor(now.getTime() / 1000) + IMAGE_LINK_TTL_S;
  return `/api/agent/images/${imageId}?expire=${expires}&signature=${signature(imageId, expires, key)}`;
}

export function verifyImageSignature(
  imageId: string,
  expires: string | null,
  given: string | null,
  now = new Date(),
  env: Record<string, string | undefined> = process.env,
): boolean {
  const key = agentKey(env);
  if (!key || !expires || !given || !/^\d+$/.test(expires)) return false;
  if (Number(expires) < Math.floor(now.getTime() / 1000)) return false;
  const expected = Buffer.from(signature(imageId, Number(expires), key));
  const provided = Buffer.from(given);
  return expected.length === provided.length && timingSafeEqual(expected, provided);
}

/** Lien temporaire (6 h) vers une image d'un carrousel, téléchargée par Instagram. */
export function signedSlidePath(
  carouselId: string,
  slide: number,
  now = new Date(),
  env: Record<string, string | undefined> = process.env,
): string | null {
  const key = agentKey(env);
  if (!key) return null;
  const expires = Math.floor(now.getTime() / 1000) + VIDEO_LINK_TTL_S;
  const sig = signature(`${carouselId}/${slide}`, expires, key, "slide");
  return `/api/social/carrousels/${carouselId}/${slide}?expire=${expires}&signature=${sig}`;
}

export function verifySlideSignature(
  carouselId: string,
  slide: number,
  expires: string | null,
  given: string | null,
  now = new Date(),
  env: Record<string, string | undefined> = process.env,
): boolean {
  const key = agentKey(env);
  if (!key || !expires || !given || !/^\d+$/.test(expires)) return false;
  if (Number(expires) < Math.floor(now.getTime() / 1000)) return false;
  const expected = Buffer.from(signature(`${carouselId}/${slide}`, Number(expires), key, "slide"));
  const provided = Buffer.from(given);
  return expected.length === provided.length && timingSafeEqual(expected, provided);
}

/** Recettes publiables : celles des administrateurs, encore présentes. */
export async function adminRecipe(db: Database, recipeId: string) {
  const [row] = await db
    .select({ id: s.recipes.id, versionId: s.recipes.currentVersionId })
    .from(s.recipes)
    .innerJoin(s.users, eq(s.users.id, s.recipes.ownerId))
    .where(
      and(
        eq(s.recipes.id, recipeId),
        eq(s.users.role, "admin"),
        eq(s.recipes.kind, "dish"),
        isNull(s.recipes.deletedAt),
      ),
    );
  return row ?? null;
}

export interface PublicationStatus {
  platform: Platform;
  format: s.PublicationFormat;
  status: s.PublicationStatusValue;
  publishedAt: string | null;
  postUrl: string | null;
  note: string | null;
}

export async function publicationStatuses(db: Database, recipeId: string): Promise<PublicationStatus[]> {
  const rows = await db
    .select()
    .from(s.recipePublications)
    .where(eq(s.recipePublications.recipeId, recipeId))
    .orderBy(asc(s.recipePublications.platform));
  return rows.map((row) => ({
    platform: row.platform,
    format: row.format,
    status: row.status,
    publishedAt: row.publishedAt?.toISOString() ?? null,
    postUrl: row.postUrl,
    note: row.note,
  }));
}

/** L'administrateur met une recette (à lui) dans la file « à publier ». */
export async function queuePublication(
  db: Database,
  adminId: string,
  recipeId: string,
  platforms: readonly Platform[],
): Promise<boolean> {
  const recipe = await adminRecipe(db, recipeId);
  const [owner] = await db
    .select({ ownerId: s.recipes.ownerId })
    .from(s.recipes)
    .where(eq(s.recipes.id, recipeId));
  if (!recipe || owner?.ownerId !== adminId || platforms.length === 0) return false;
  for (const platform of platforms) {
    await db
      .insert(s.recipePublications)
      .values({ recipeId, platform, status: "queued" })
      .onConflictDoUpdate({
        target: [s.recipePublications.recipeId, s.recipePublications.platform, s.recipePublications.format],
        set: { status: "queued", publishedAt: null, postUrl: null, note: null, updatedAt: new Date() },
      });
  }
  await audit(db, {
    actorId: adminId,
    action: "publication.queue",
    entity: "recipe",
    entityId: recipeId,
    after: platforms,
  });
  return true;
}

/** Retire une recette de la file (les publications déjà faites restent visibles). */
export async function cancelPublication(db: Database, adminId: string, recipeId: string): Promise<boolean> {
  const [owner] = await db
    .select({ ownerId: s.recipes.ownerId })
    .from(s.recipes)
    .where(eq(s.recipes.id, recipeId));
  if (owner?.ownerId !== adminId) return false;
  await db
    .delete(s.recipePublications)
    .where(and(eq(s.recipePublications.recipeId, recipeId), eq(s.recipePublications.status, "queued")));
  await audit(db, { actorId: adminId, action: "publication.cancel", entity: "recipe", entityId: recipeId });
  return true;
}

type PublishedReport = { status: "published"; postUrl?: string | null; publishedAt?: Date | null };
type FailedReport = { status: "failed"; note?: string | null };
export type PublicationReport = PublishedReport | FailedReport;

/** Compte rendu de l'agent (ou saisie manuelle de l'administrateur) pour un réseau. */
export async function reportPublication(
  db: Database,
  recipeId: string,
  platform: Platform,
  report: PublicationReport,
  actor: { actorId: string | null; via: "agent" | "admin" },
): Promise<boolean> {
  if (!(await adminRecipe(db, recipeId))) return false;
  const values =
    report.status === "published"
      ? {
          status: "published" as const,
          publishedAt: report.publishedAt ?? new Date(),
          postUrl: report.postUrl ?? null,
          note: null,
        }
      : {
          status: "failed" as const,
          publishedAt: null,
          postUrl: null,
          note: report.note?.slice(0, 500) ?? null,
        };
  await db
    .insert(s.recipePublications)
    .values({ recipeId, platform, ...values })
    .onConflictDoUpdate({
      target: [s.recipePublications.recipeId, s.recipePublications.platform, s.recipePublications.format],
      set: { ...values, updatedAt: new Date() },
    });
  await audit(db, {
    actorId: actor.actorId,
    action: `publication.${report.status}`,
    entity: "recipe",
    entityId: recipeId,
    after: { platform, via: actor.via, ...values },
  });
  return true;
}

export interface AgentRecipe {
  recipeId: string;
  name: string;
  description: string | null;
  language: string;
  /** Réseaux encore à publier pour cette recette. */
  pending: Platform[];
  publications: PublicationStatus[];
  social: Array<{
    platform: string;
    title: string | null;
    description: string | null;
    caption: string | null;
    hashtags: string[];
  }>;
  /** Liens temporaires (1 h) vers les photos de la version active, par format. */
  images: Array<{ format: string; width: number | null; height: number | null; url: string }>;
}

/**
 * File de l'agent : recettes des administrateurs marquées « à publier »
 * (ou une recette précise), avec tout ce qu'il faut pour publier.
 */
export async function agentQueue(
  db: Database,
  baseUrl: string,
  options: { recipeId?: string; now?: Date } = {},
): Promise<AgentRecipe[]> {
  const rows = await db
    .select({ recipeId: s.recipePublications.recipeId })
    .from(s.recipePublications)
    .where(
      options.recipeId
        ? eq(s.recipePublications.recipeId, options.recipeId)
        : eq(s.recipePublications.status, "queued"),
    )
    .orderBy(desc(s.recipePublications.updatedAt));
  const ids = [...new Set(rows.map((r) => r.recipeId))];
  const result: AgentRecipe[] = [];
  for (const recipeId of ids) {
    const recipe = await adminRecipe(db, recipeId);
    if (!recipe?.versionId) continue;
    const [version] = await db
      .select({
        name: s.recipeVersions.name,
        description: s.recipeVersions.description,
        language: s.recipes.originalLanguage,
      })
      .from(s.recipeVersions)
      .innerJoin(s.recipes, eq(s.recipes.id, s.recipeVersions.recipeId))
      .where(eq(s.recipeVersions.id, recipe.versionId));
    const [publications, social, images] = await Promise.all([
      publicationStatuses(db, recipeId),
      db
        .select()
        .from(s.socialContents)
        .where(
          and(
            eq(s.socialContents.recipeVersionId, recipe.versionId),
            inArray(s.socialContents.platform, ["instagram", "tiktok", "pinterest"]),
          ),
        ),
      db
        .select({
          id: s.recipeImages.id,
          sourceId: s.recipeImages.sourceImageId,
          format: s.recipeImages.format,
          width: s.recipeImages.width,
          height: s.recipeImages.height,
        })
        .from(s.recipeImages)
        .where(and(eq(s.recipeImages.recipeVersionId, recipe.versionId), eq(s.recipeImages.status, "ready")))
        .orderBy(desc(s.recipeImages.createdAt)),
    ]);
    // Dernière photo : son image HD et ses recadrages.
    const latest = images.find((i) => i.format === "source");
    const chosen = latest ? [latest, ...images.filter((i) => i.sourceId === latest.id)] : [];
    result.push({
      recipeId,
      name: version?.name ?? "",
      description: version?.description ?? null,
      language: version?.language ?? "fr",
      pending: publications.filter((p) => p.status === "queued").map((p) => p.platform),
      publications,
      social: social.map((c) => ({
        platform: c.platform,
        title: c.title,
        description: c.description,
        caption: c.caption,
        hashtags: c.hashtags,
      })),
      images: chosen.flatMap((image) => {
        const path = signedImagePath(image.id, options.now);
        return path
          ? [{ format: image.format, width: image.width, height: image.height, url: `${baseUrl}${path}` }]
          : [];
      }),
    });
  }
  return result;
}
