/**
 * Publication de la vidéo d'une recette, après validation par l'administrateur :
 * Reel Instagram (conteneur, puis publication quand Instagram a fini de traiter la vidéo)
 * ou TikTok (téléchargement par TikTok depuis culinova.fr, puis suivi de l'état).
 * Une publication passe par « processing » puis « published » ou « failed ».
 */
import type { Database } from "@culinova/db";
import * as s from "@culinova/db/schema";
import { and, eq } from "drizzle-orm";
import { audit } from "../audit";
import { appUrl } from "../auth";
import { adminRecipe, signedVideoPath } from "../publishing";
import { accountToken, type SocialPlatform } from "./accounts";
import { instagramContainerStatus, instagramCreateReel, instagramPublish, SocialApiError } from "./instagram";
import { tiktokCreatorInfo, tiktokInitPost, tiktokPostStatus, type TiktokPostOptions } from "./tiktok";
import { latestVideo } from "./videos";

export interface PublishDeps {
  fetchImpl?: typeof fetch;
  now?: Date;
}

export type TiktokChoices = Omit<TiktokPostOptions, "title">;

export type StartResult =
  | { ok: true }
  | {
      ok: false;
      reason: "not_found" | "no_video" | "not_connected" | "invalid_privacy" | "too_long" | "failed";
      detail?: string;
    };

const MAX_CAPTION = 2200;

/** Légende : texte du réseau (ou de l'autre réseau), puis les hashtags. */
export async function captionFor(db: Database, versionId: string, platform: SocialPlatform): Promise<string> {
  const contents = await db
    .select()
    .from(s.socialContents)
    .where(eq(s.socialContents.recipeVersionId, versionId));
  const instagram = contents.find((c) => c.platform === "instagram");
  const tiktok = contents.find((c) => c.platform === "tiktok");
  const hashtags = (instagram?.hashtags.length ? instagram.hashtags : (tiktok?.hashtags ?? []))
    .slice(0, platform === "instagram" ? 15 : 8)
    .map((tag) => `#${tag.replace(/^#/, "").replace(/\s+/g, "")}`)
    .join(" ");
  const text =
    platform === "instagram"
      ? (instagram?.caption ?? instagram?.description ?? "")
      : [tiktok?.title, tiktok?.description].filter(Boolean).join("\n\n") || (instagram?.caption ?? "");
  return [text.trim(), hashtags].filter(Boolean).join("\n\n").slice(0, MAX_CAPTION);
}

async function setPublication(
  db: Database,
  recipeId: string,
  platform: SocialPlatform,
  values: Partial<typeof s.recipePublications.$inferInsert>,
) {
  await db
    .insert(s.recipePublications)
    .values({ recipeId, platform, status: "queued", ...values })
    .onConflictDoUpdate({
      target: [s.recipePublications.recipeId, s.recipePublications.platform],
      set: { ...values, updatedAt: new Date() },
    });
}

function message(error: unknown): string {
  return (error instanceof Error ? error.message : String(error)).slice(0, 500);
}

/**
 * Lance la publication de la dernière vidéo de la recette sur un réseau.
 * TikTok : la confidentialité et les interactions sont choisies par l'administrateur
 * parmi les options proposées par TikTok pour ce compte.
 */
export async function startPublication(
  db: Database,
  adminId: string,
  recipeId: string,
  platform: SocialPlatform,
  choices: TiktokChoices | null,
  deps: PublishDeps = {},
): Promise<StartResult> {
  const fetchImpl = deps.fetchImpl ?? fetch;
  const recipe = await adminRecipe(db, recipeId);
  const [owner] = await db
    .select({ ownerId: s.recipes.ownerId })
    .from(s.recipes)
    .where(eq(s.recipes.id, recipeId));
  if (!recipe?.versionId || owner?.ownerId !== adminId) return { ok: false, reason: "not_found" };
  const video = await latestVideo(db, recipeId);
  if (!video) return { ok: false, reason: "no_video" };
  const account = await accountToken(db, platform, { fetchImpl, now: deps.now }).catch(() => null);
  if (!account) return { ok: false, reason: "not_connected" };
  const path = signedVideoPath(video.id, deps.now);
  if (!path) return { ok: false, reason: "failed", detail: "AGENT_API_KEY manquante" };
  const videoUrl = `${appUrl()}${path}`;
  const caption = await captionFor(db, recipe.versionId, platform);

  try {
    let externalId: string;
    let privacy: string | null = null;
    if (platform === "instagram") {
      externalId = await instagramCreateReel(
        account.accessToken,
        account.accountId,
        { videoUrl, caption },
        fetchImpl,
      );
    } else {
      if (!choices) return { ok: false, reason: "invalid_privacy" };
      const creator = await tiktokCreatorInfo(account.accessToken, fetchImpl);
      if (!creator.privacyOptions.includes(choices.privacy)) return { ok: false, reason: "invalid_privacy" };
      if (video.durationS > creator.maxDurationS) return { ok: false, reason: "too_long" };
      externalId = await tiktokInitPost(
        account.accessToken,
        videoUrl,
        {
          title: caption,
          privacy: choices.privacy,
          allowComments: choices.allowComments && !creator.commentDisabled,
          allowDuet: choices.allowDuet && !creator.duetDisabled,
          allowStitch: choices.allowStitch && !creator.stitchDisabled,
        },
        fetchImpl,
      );
      privacy = choices.privacy;
    }
    await setPublication(db, recipeId, platform, {
      status: "processing",
      externalId,
      videoId: video.id,
      privacy,
      postId: null,
      postUrl: null,
      publishedAt: null,
      note: null,
    });
    await audit(db, {
      actorId: adminId,
      action: "publication.start",
      entity: "recipe",
      entityId: recipeId,
      after: { platform, videoId: video.id, privacy },
    });
    return { ok: true };
  } catch (error) {
    await setPublication(db, recipeId, platform, {
      status: "failed",
      note: message(error),
      videoId: video.id,
    });
    return { ok: false, reason: "failed", detail: message(error) };
  }
}

export type AdvanceOutcome = "processing" | "published" | "failed" | "skipped";

/** Fait avancer une publication en cours : vérifie l'état chez le réseau et conclut si possible. */
export async function advancePublication(
  db: Database,
  publicationId: string,
  deps: PublishDeps = {},
): Promise<AdvanceOutcome> {
  const fetchImpl = deps.fetchImpl ?? fetch;
  const now = deps.now ?? new Date();
  const [row] = await db
    .select()
    .from(s.recipePublications)
    .where(and(eq(s.recipePublications.id, publicationId), eq(s.recipePublications.status, "processing")));
  if (!row?.externalId) return "skipped";
  const fail = async (note: string) => {
    await db
      .update(s.recipePublications)
      .set({ status: "failed", note: note.slice(0, 500) })
      .where(eq(s.recipePublications.id, row.id));
    await audit(db, {
      actorId: null,
      action: "publication.failed",
      entity: "recipe",
      entityId: row.recipeId,
      after: { platform: row.platform, note },
    });
    return "failed" as const;
  };
  const succeed = async (postId: string | null, postUrl: string | null) => {
    await db
      .update(s.recipePublications)
      .set({ status: "published", postId, postUrl, publishedAt: now, note: null })
      .where(eq(s.recipePublications.id, row.id));
    await audit(db, {
      actorId: null,
      action: "publication.published",
      entity: "recipe",
      entityId: row.recipeId,
      after: { platform: row.platform, postUrl },
    });
    return "published" as const;
  };

  const account = await accountToken(db, row.platform, { fetchImpl, now }).catch(() => null);
  if (!account) return fail("Compte non relié ou jeton expiré : reliez le compte dans l'administration.");
  // Au-delà de 2 h, le réseau n'aboutira plus.
  if (now.getTime() - row.updatedAt.getTime() > 2 * 3600 * 1000)
    return fail("Traitement trop long chez le réseau.");

  try {
    if (row.platform === "instagram") {
      const status = await instagramContainerStatus(account.accessToken, row.externalId, fetchImpl);
      if (status.code === "IN_PROGRESS") return "processing";
      if (status.code !== "FINISHED")
        return fail(`Instagram : ${status.code}${status.detail ? ` (${status.detail})` : ""}`);
      const media = await instagramPublish(account.accessToken, account.accountId, row.externalId, fetchImpl);
      return succeed(media.mediaId, media.permalink);
    }
    const status = await tiktokPostStatus(account.accessToken, row.externalId, fetchImpl);
    if (status.status === "FAILED") return fail(`TikTok : ${status.failReason ?? "échec"}`);
    if (status.status !== "PUBLISH_COMPLETE") return "processing";
    const handle = account.username ? `@${account.username}` : null;
    return succeed(
      status.postId,
      status.postId && handle ? `https://www.tiktok.com/${handle}/video/${status.postId}` : null,
    );
  } catch (error) {
    // Erreur passagère (réseau, 5xx) : on réessaiera ; erreur définitive : échec.
    if (error instanceof SocialApiError && error.status >= 400 && error.status < 500)
      return fail(message(error));
    return "processing";
  }
}

/** Publications en cours d'une recette (ou de toutes), avancées une fois. */
export async function advanceProcessing(db: Database, recipeId?: string, deps: PublishDeps = {}) {
  const rows = await db
    .select({ id: s.recipePublications.id })
    .from(s.recipePublications)
    .where(
      recipeId
        ? and(eq(s.recipePublications.status, "processing"), eq(s.recipePublications.recipeId, recipeId))
        : eq(s.recipePublications.status, "processing"),
    );
  const outcomes: AdvanceOutcome[] = [];
  for (const row of rows) outcomes.push(await advancePublication(db, row.id, deps));
  return outcomes;
}
