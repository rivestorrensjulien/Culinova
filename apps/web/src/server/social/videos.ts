/**
 * Vidéos des recettes fabriquées par l'agent (dossier agent/, GitHub Actions) :
 * file des vidéos à fabriquer, enregistrement et envoi du fichier, vidéo à afficher.
 */
import type { Database } from "@culinova/db";
import * as s from "@culinova/db/schema";
import { and, desc, eq, gte, inArray, isNotNull, notInArray } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { audit } from "../audit";
import { adminRecipe, signedImagePath } from "../publishing";
import { parseVideoScript } from "./script";
import { createVideoStorage, type UploadInstructions, type VideoStorage } from "./video-storage";

/** Au-delà de 3 échecs pour une même version, l'agent ne réessaie plus seul. */
const MAX_FAILURES = 3;
/** Un envoi commencé il y a moins de 20 minutes est en cours : pas de seconde vidéo. */
const UPLOAD_GRACE_MS = 20 * 60 * 1000;

export interface VideoJob {
  recipeId: string;
  versionId: string;
  name: string;
  hook: string;
  shots: string[];
  /** Photo 9:16 affichée sur la page de la recette (celle que la vidéo doit montrer). */
  imageId: string;
  /** Lien signé (1 h) vers cette photo. */
  photoUrl: string;
}

/**
 * Recadrage (9:16, 4:5…) de la photo principale de la version (celle affichée sur la page
 * de la recette), ou à défaut le dernier recadrage prêt de ce format.
 */
export async function currentPhoto(
  db: Database,
  versionId: string,
  format: "9:16" | "4:5" | "1:1",
): Promise<string | null> {
  const source = alias(s.recipeImages, "source");
  const [primary] = await db
    .select({ id: s.recipeImages.id })
    .from(s.recipeImages)
    .innerJoin(source, eq(source.id, s.recipeImages.sourceImageId))
    .where(
      and(
        eq(s.recipeImages.recipeVersionId, versionId),
        eq(s.recipeImages.format, format),
        eq(s.recipeImages.status, "ready"),
        eq(source.isPrimary, true),
      ),
    )
    .orderBy(desc(source.createdAt))
    .limit(1);
  if (primary) return primary.id;
  const [latest] = await db
    .select({ id: s.recipeImages.id })
    .from(s.recipeImages)
    .where(
      and(
        eq(s.recipeImages.recipeVersionId, versionId),
        eq(s.recipeImages.format, format),
        eq(s.recipeImages.status, "ready"),
      ),
    )
    .orderBy(desc(s.recipeImages.createdAt))
    .limit(1);
  return latest?.id ?? null;
}

/** Photo 9:16 montrée dans la vidéo. */
export function currentVerticalPhoto(db: Database, versionId: string): Promise<string | null> {
  return currentPhoto(db, versionId, "9:16");
}

/**
 * Ce qu'il faut pour fabriquer la vidéo de la version active d'une recette : script TikTok
 * et photo de la recette, tous deux de la même version (sinon null : pas de vidéo sans photo,
 * pour que la vidéo montre exactement le plat de la recette).
 */
async function jobFor(db: Database, recipeId: string, baseUrl: string, now: Date): Promise<VideoJob | null> {
  const recipe = await adminRecipe(db, recipeId);
  if (!recipe?.versionId) return null;
  const [version] = await db
    .select({ name: s.recipeVersions.name })
    .from(s.recipeVersions)
    .where(eq(s.recipeVersions.id, recipe.versionId));
  const [tiktok] = await db
    .select({ caption: s.socialContents.caption })
    .from(s.socialContents)
    .where(
      and(eq(s.socialContents.recipeVersionId, recipe.versionId), eq(s.socialContents.platform, "tiktok")),
    );
  const script = parseVideoScript(tiktok?.caption);
  const imageId = await currentVerticalPhoto(db, recipe.versionId);
  const path = imageId ? signedImagePath(imageId, now) : null;
  if (!version || !script || !imageId || !path) return null;
  return {
    recipeId,
    versionId: recipe.versionId,
    name: version.name,
    hook: script.hook,
    shots: script.shots,
    imageId,
    photoUrl: `${baseUrl}${path}`,
  };
}

/**
 * Vidéos à fabriquer : recettes « à publier » dont la photo actuelle n'a pas encore de
 * vidéo (ni d'envoi en cours, ni trop d'échecs) : changer la photo ou la version refait la vidéo. Avec une recette précise : toujours
 * une nouvelle vidéo (pour en refaire une).
 */
export async function videoJobs(
  db: Database,
  baseUrl: string,
  options: { recipeId?: string; now?: Date } = {},
): Promise<VideoJob[]> {
  const now = options.now ?? new Date();
  if (options.recipeId) {
    const job = await jobFor(db, options.recipeId, baseUrl, now);
    return job ? [job] : [];
  }
  const queued = await db
    .selectDistinct({ recipeId: s.recipePublications.recipeId })
    .from(s.recipePublications)
    .where(eq(s.recipePublications.status, "queued"));
  const jobs: VideoJob[] = [];
  for (const { recipeId } of queued) {
    const job = await jobFor(db, recipeId, baseUrl, now);
    if (!job) continue;
    const videos = await db
      .select({ status: s.recipeVideos.status, createdAt: s.recipeVideos.createdAt })
      .from(s.recipeVideos)
      .where(and(eq(s.recipeVideos.recipeVersionId, job.versionId), eq(s.recipeVideos.imageId, job.imageId)));
    const done = videos.some(
      (v) =>
        v.status === "ready" ||
        (v.status === "uploading" && now.getTime() - v.createdAt.getTime() < UPLOAD_GRACE_MS),
    );
    const failures = videos.filter((v) => v.status === "failed").length;
    if (!done && failures < MAX_FAILURES) jobs.push(job);
  }
  return jobs;
}

export interface VideoRegistration {
  recipeId: string;
  versionId: string;
  /** Photo 9:16 montrée dans la vidéo. */
  imageId?: string | null;
  durationS: number;
  width: number;
  height: number;
  sizeBytes: number;
}

export type RegisterResult =
  | { ok: true; videoId: string; upload: UploadInstructions }
  | { ok: false; reason: "recipe_not_found" | "version_not_found" };

/** L'agent annonce une vidéo : ligne « en cours d'envoi » et lien d'envoi du fichier. */
export async function registerVideo(
  db: Database,
  input: VideoRegistration,
  storage: VideoStorage = createVideoStorage(),
): Promise<RegisterResult> {
  if (!(await adminRecipe(db, input.recipeId))) return { ok: false, reason: "recipe_not_found" };
  const [version] = await db
    .select({ id: s.recipeVersions.id })
    .from(s.recipeVersions)
    .where(and(eq(s.recipeVersions.id, input.versionId), eq(s.recipeVersions.recipeId, input.recipeId)));
  if (!version) return { ok: false, reason: "version_not_found" };
  const [row] = await db
    .insert(s.recipeVideos)
    .values({
      recipeId: input.recipeId,
      recipeVersionId: input.versionId,
      imageId: input.imageId ?? null,
      storageKey: "",
      durationMs: Math.round(input.durationS * 1000),
      width: input.width,
      height: input.height,
      sizeBytes: input.sizeBytes,
    })
    .returning({ id: s.recipeVideos.id });
  const key = `${input.recipeId}/${row!.id}.mp4`;
  await db.update(s.recipeVideos).set({ storageKey: key }).where(eq(s.recipeVideos.id, row!.id));
  let instructions: UploadInstructions | null;
  try {
    instructions = await storage.uploadInstructions(key);
  } catch (error) {
    // Pas de lien d'envoi : la ligne ne doit pas bloquer les prochains essais.
    await db.delete(s.recipeVideos).where(eq(s.recipeVideos.id, row!.id));
    throw error;
  }
  const upload = instructions ?? {
    url: `/api/agent/videos/${row!.id}/fichier`,
    method: "PUT" as const,
    headers: { "Content-Type": "video/mp4" },
  };
  return { ok: true, videoId: row!.id, upload };
}

export async function videoById(db: Database, videoId: string) {
  const [row] = await db.select().from(s.recipeVideos).where(eq(s.recipeVideos.id, videoId));
  return row ?? null;
}

/**
 * Compte rendu de l'agent après l'envoi : prête (le fichier doit être présent) ou en échec.
 * Une vidéo prête remplace les précédentes de la recette qui n'ont jamais été publiées.
 */
export async function completeVideo(
  db: Database,
  videoId: string,
  report: { status: "ready" } | { status: "failed"; note: string },
  storage: VideoStorage = createVideoStorage(),
): Promise<{ ok: true } | { ok: false; reason: "not_found" | "file_missing" }> {
  const video = await videoById(db, videoId);
  if (!video) return { ok: false, reason: "not_found" };
  if (report.status === "failed") {
    await db
      .update(s.recipeVideos)
      .set({ status: "failed", note: report.note.slice(0, 500) })
      .where(eq(s.recipeVideos.id, videoId));
    return { ok: true };
  }
  if (!(await storage.exists(video.storageKey))) return { ok: false, reason: "file_missing" };
  await db.update(s.recipeVideos).set({ status: "ready", note: null }).where(eq(s.recipeVideos.id, videoId));

  const published = await db
    .select({ videoId: s.recipePublications.videoId })
    .from(s.recipePublications)
    .where(and(eq(s.recipePublications.recipeId, video.recipeId), isNotNull(s.recipePublications.videoId)));
  const keep = [videoId, ...published.flatMap((p) => (p.videoId ? [p.videoId] : []))];
  const older = await db
    .select({ id: s.recipeVideos.id, key: s.recipeVideos.storageKey })
    .from(s.recipeVideos)
    .where(and(eq(s.recipeVideos.recipeId, video.recipeId), notInArray(s.recipeVideos.id, keep)));
  if (older.length > 0) {
    await storage.remove(older.map((o) => o.key)).catch(() => {});
    await db.delete(s.recipeVideos).where(
      inArray(
        s.recipeVideos.id,
        older.map((o) => o.id),
      ),
    );
  }
  await audit(db, { actorId: null, action: "video.ready", entity: "recipe", entityId: video.recipeId });
  return { ok: true };
}

export interface RecipeVideoView {
  id: string;
  durationS: number;
  createdAt: string;
  /** La vidéo a été fabriquée pour la version active et la photo actuelle de la recette. */
  current: boolean;
}

/** Dernière vidéo prête d'une recette (pour l'encart de publication). */
export async function latestVideo(db: Database, recipeId: string): Promise<RecipeVideoView | null> {
  const [row] = await db
    .select({
      id: s.recipeVideos.id,
      durationMs: s.recipeVideos.durationMs,
      createdAt: s.recipeVideos.createdAt,
      versionId: s.recipeVideos.recipeVersionId,
      imageId: s.recipeVideos.imageId,
      currentVersionId: s.recipes.currentVersionId,
    })
    .from(s.recipeVideos)
    .innerJoin(s.recipes, eq(s.recipes.id, s.recipeVideos.recipeId))
    .where(and(eq(s.recipeVideos.recipeId, recipeId), eq(s.recipeVideos.status, "ready")))
    .orderBy(desc(s.recipeVideos.createdAt))
    .limit(1);
  if (!row) return null;
  const photo = row.currentVersionId ? await currentVerticalPhoto(db, row.currentVersionId) : null;
  return {
    id: row.id,
    durationS: row.durationMs / 1000,
    createdAt: row.createdAt.toISOString(),
    current: row.versionId === row.currentVersionId && (!row.imageId || row.imageId === photo),
  };
}

/** Dernier échec récent de fabrication (24 h), pour l'afficher à l'administrateur. */
export async function lastVideoFailure(db: Database, recipeId: string, now = new Date()) {
  const [row] = await db
    .select({ note: s.recipeVideos.note, createdAt: s.recipeVideos.createdAt })
    .from(s.recipeVideos)
    .where(
      and(
        eq(s.recipeVideos.recipeId, recipeId),
        eq(s.recipeVideos.status, "failed"),
        gte(s.recipeVideos.createdAt, new Date(now.getTime() - 24 * 3600 * 1000)),
      ),
    )
    .orderBy(desc(s.recipeVideos.createdAt))
    .limit(1);
  return row ? { note: row.note, at: row.createdAt.toISOString() } : null;
}
