/**
 * Carrousels Instagram fabriqués par l'agent : photo de la recette, ingrédients pesés,
 * étapes, puis carte de fin (images JPEG 1080 × 1350). Comme pour la vidéo, le carrousel
 * retient sa photo : nouvelle photo ou nouvelle version → carrousel à refaire.
 */
import type { Database } from "@culinova/db";
import * as s from "@culinova/db/schema";
import { and, desc, eq, inArray, isNotNull, notInArray } from "drizzle-orm";
import { loadRecipeView } from "../generation/view";
import { adminRecipe, signedImagePath } from "../publishing";
import { amountText, stepPlainText } from "../recipe-text";
import { createVideoStorage, type UploadInstructions, type VideoStorage } from "./video-storage";
import { parseVideoScript } from "./script";
import { currentPhoto } from "./videos";

const MAX_FAILURES = 3;
const UPLOAD_GRACE_MS = 20 * 60 * 1000;
/** Instagram accepte 10 images au plus par carrousel. */
export const MAX_SLIDES = 10;

export interface CarouselJob {
  recipeId: string;
  versionId: string;
  name: string;
  servings: number;
  totalMinutes: number;
  ingredients: Array<{ label: string; amount: string }>;
  steps: string[];
  /** Étapes résumées en lignes courtes (script TikTok, sans quantités) pour la page « La recette en bref ». */
  summary: string[];
  /** Photo 4:5 de la recette (celle de sa page). */
  imageId: string;
  photoUrl: string;
}

async function jobFor(
  db: Database,
  recipeId: string,
  baseUrl: string,
  now: Date,
): Promise<CarouselJob | null> {
  const recipe = await adminRecipe(db, recipeId);
  if (!recipe?.versionId) return null;
  const imageId = await currentPhoto(db, recipe.versionId, "4:5");
  const path = imageId ? signedImagePath(imageId, now) : null;
  if (!imageId || !path) return null;
  const [owner] = await db
    .select({ ownerId: s.recipes.ownerId })
    .from(s.recipes)
    .where(eq(s.recipes.id, recipeId));
  const view = owner ? await loadRecipeView(db, recipeId, owner.ownerId) : null;
  if (!view || view.steps.length === 0) return null;
  const [tiktok] = await db
    .select({ caption: s.socialContents.caption })
    .from(s.socialContents)
    .where(
      and(eq(s.socialContents.recipeVersionId, recipe.versionId), eq(s.socialContents.platform, "tiktok")),
    );
  return {
    recipeId,
    versionId: recipe.versionId,
    name: view.name,
    servings: view.servings,
    totalMinutes: Math.round((view.prepS + view.cookS + view.restS) / 60),
    ingredients: view.ingredients.map((i) => ({ label: i.label, amount: amountText(i) })),
    steps: view.steps.map((step) => stepPlainText(view, step.action)),
    summary: parseVideoScript(tiktok?.caption)?.shots ?? [],
    imageId,
    photoUrl: `${baseUrl}${path}`,
  };
}

/** Carrousels à fabriquer : recettes « à publier » dont la photo actuelle n'a pas encore de carrousel. */
export async function carouselJobs(
  db: Database,
  baseUrl: string,
  options: { recipeId?: string; now?: Date } = {},
): Promise<CarouselJob[]> {
  const now = options.now ?? new Date();
  if (options.recipeId) {
    const job = await jobFor(db, options.recipeId, baseUrl, now);
    return job ? [job] : [];
  }
  const queued = await db
    .selectDistinct({ recipeId: s.recipePublications.recipeId })
    .from(s.recipePublications)
    .where(eq(s.recipePublications.status, "queued"));
  const jobs: CarouselJob[] = [];
  for (const { recipeId } of queued) {
    const job = await jobFor(db, recipeId, baseUrl, now);
    if (!job) continue;
    const rows = await db
      .select({ status: s.recipeCarousels.status, createdAt: s.recipeCarousels.createdAt })
      .from(s.recipeCarousels)
      .where(
        and(eq(s.recipeCarousels.recipeVersionId, job.versionId), eq(s.recipeCarousels.imageId, job.imageId)),
      );
    const done = rows.some(
      (r) =>
        r.status === "ready" ||
        (r.status === "uploading" && now.getTime() - r.createdAt.getTime() < UPLOAD_GRACE_MS),
    );
    if (!done && rows.filter((r) => r.status === "failed").length < MAX_FAILURES) jobs.push(job);
  }
  return jobs;
}

export function slideKey(prefix: string, slide: number): string {
  return `${prefix}/${String(slide).padStart(2, "0")}.jpg`;
}

type RegisterRefusal = { ok: false; reason: "recipe_not_found" | "version_not_found" };
type Registered = { ok: true; carouselId: string; uploads: UploadInstructions[] };

/** L'agent annonce un carrousel : un lien d'envoi par image (1 à 10). */
export async function registerCarousel(
  db: Database,
  input: { recipeId: string; versionId: string; imageId: string | null; slideCount: number },
  storage: VideoStorage = createVideoStorage(),
): Promise<Registered | RegisterRefusal> {
  if (!(await adminRecipe(db, input.recipeId))) return { ok: false, reason: "recipe_not_found" };
  const [version] = await db
    .select({ id: s.recipeVersions.id })
    .from(s.recipeVersions)
    .where(and(eq(s.recipeVersions.id, input.versionId), eq(s.recipeVersions.recipeId, input.recipeId)));
  if (!version) return { ok: false, reason: "version_not_found" };
  const [row] = await db
    .insert(s.recipeCarousels)
    .values({
      recipeId: input.recipeId,
      recipeVersionId: input.versionId,
      imageId: input.imageId,
      slideCount: input.slideCount,
      storagePrefix: "",
    })
    .returning({ id: s.recipeCarousels.id });
  const prefix = `${input.recipeId}/carrousel-${row!.id}`;
  await db.update(s.recipeCarousels).set({ storagePrefix: prefix }).where(eq(s.recipeCarousels.id, row!.id));
  const uploads: UploadInstructions[] = [];
  try {
    for (let slide = 1; slide <= input.slideCount; slide++) {
      uploads.push(
        (await storage.uploadInstructions(slideKey(prefix, slide), "image/jpeg")) ?? {
          url: `/api/agent/carrousels/${row!.id}/fichier/${slide}`,
          method: "PUT",
          headers: { "Content-Type": "image/jpeg" },
        },
      );
    }
  } catch (error) {
    // Pas de lien d'envoi : la ligne ne doit pas bloquer les prochains essais.
    await db.delete(s.recipeCarousels).where(eq(s.recipeCarousels.id, row!.id));
    throw error;
  }
  return { ok: true, carouselId: row!.id, uploads };
}

export async function carouselById(db: Database, carouselId: string) {
  const [row] = await db.select().from(s.recipeCarousels).where(eq(s.recipeCarousels.id, carouselId));
  return row ?? null;
}

/** Compte rendu de l'agent : toutes les images doivent être arrivées. */
export async function completeCarousel(
  db: Database,
  carouselId: string,
  report: { status: "ready" } | { status: "failed"; note: string },
  storage: VideoStorage = createVideoStorage(),
): Promise<{ ok: true } | { ok: false; reason: "not_found" | "file_missing" }> {
  const carousel = await carouselById(db, carouselId);
  if (!carousel) return { ok: false, reason: "not_found" };
  if (report.status === "failed") {
    await db
      .update(s.recipeCarousels)
      .set({ status: "failed", note: report.note.slice(0, 500) })
      .where(eq(s.recipeCarousels.id, carouselId));
    return { ok: true };
  }
  for (let slide = 1; slide <= carousel.slideCount; slide++) {
    if (!(await storage.exists(slideKey(carousel.storagePrefix, slide)))) {
      return { ok: false, reason: "file_missing" };
    }
  }
  await db
    .update(s.recipeCarousels)
    .set({ status: "ready", note: null })
    .where(eq(s.recipeCarousels.id, carouselId));

  // Les anciens carrousels jamais publiés sont effacés.
  const keepIds = [carouselId, ...(await publishedCarouselIds(db, carousel.recipeId))];
  const older = await db
    .select({
      id: s.recipeCarousels.id,
      prefix: s.recipeCarousels.storagePrefix,
      count: s.recipeCarousels.slideCount,
    })
    .from(s.recipeCarousels)
    .where(and(eq(s.recipeCarousels.recipeId, carousel.recipeId), notInArray(s.recipeCarousels.id, keepIds)));
  if (older.length > 0) {
    const keys = older.flatMap((o) => Array.from({ length: o.count }, (_, i) => slideKey(o.prefix, i + 1)));
    await storage.remove(keys).catch(() => {});
    await db.delete(s.recipeCarousels).where(
      inArray(
        s.recipeCarousels.id,
        older.map((o) => o.id),
      ),
    );
  }
  return { ok: true };
}

/** Carrousels déjà publiés (gardés pour l'historique) : la colonne video_id porte leur identifiant. */
async function publishedCarouselIds(db: Database, recipeId: string): Promise<string[]> {
  const rows = await db
    .select({ id: s.recipePublications.videoId })
    .from(s.recipePublications)
    .where(
      and(
        eq(s.recipePublications.recipeId, recipeId),
        eq(s.recipePublications.format, "carousel"),
        isNotNull(s.recipePublications.videoId),
      ),
    );
  return rows.flatMap((r) => (r.id ? [r.id] : []));
}

export interface RecipeCarouselView {
  id: string;
  slideCount: number;
  createdAt: string;
  /** Fabriqué pour la version active et la photo actuelle. */
  current: boolean;
}

export async function latestCarousel(db: Database, recipeId: string): Promise<RecipeCarouselView | null> {
  const [row] = await db
    .select({
      id: s.recipeCarousels.id,
      slideCount: s.recipeCarousels.slideCount,
      createdAt: s.recipeCarousels.createdAt,
      versionId: s.recipeCarousels.recipeVersionId,
      imageId: s.recipeCarousels.imageId,
      currentVersionId: s.recipes.currentVersionId,
    })
    .from(s.recipeCarousels)
    .innerJoin(s.recipes, eq(s.recipes.id, s.recipeCarousels.recipeId))
    .where(and(eq(s.recipeCarousels.recipeId, recipeId), eq(s.recipeCarousels.status, "ready")))
    .orderBy(desc(s.recipeCarousels.createdAt))
    .limit(1);
  if (!row) return null;
  const photo = row.currentVersionId ? await currentPhoto(db, row.currentVersionId, "4:5") : null;
  return {
    id: row.id,
    slideCount: row.slideCount,
    createdAt: row.createdAt.toISOString(),
    current: row.versionId === row.currentVersionId && row.imageId === photo,
  };
}
