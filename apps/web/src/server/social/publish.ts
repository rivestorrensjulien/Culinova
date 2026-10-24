/**
 * Publication d'une recette après validation par l'administrateur :
 * Instagram — photo dans le fil, carrousel (photo, ingrédients, étapes) ou Reel ;
 * TikTok — vidéo (téléchargée par TikTok depuis culinova.fr), étiquetée « générée par IA » ;
 * Pinterest — épingle (photo 4:5, titre, description, lien vers culinova.fr), publiée aussitôt.
 * Une publication passe par « processing » puis « published » ou « failed ».
 */
import type { Database } from "@culinova/db";
import * as s from "@culinova/db/schema";
import { and, eq } from "drizzle-orm";
import { audit } from "../audit";
import { appUrl } from "../auth";
import { adminRecipe, signedImagePath, signedSlidePath, signedVideoPath } from "../publishing";
import { accountToken, type SocialPlatform } from "./accounts";
import { captionFor, MAX_CAPTION, pinTitleFor, withRecipeLink } from "./captions";
import { getCommentReply, withCommentInvite } from "./comment-reply";
import { latestCarousel } from "./carousels";
import {
  instagramContainerStatus,
  instagramCreateCarousel,
  instagramCreateImage,
  instagramCreateReel,
  instagramPublish,
  SocialApiError,
} from "./instagram";
import { ensurePublicPage, publicRecipeUrl } from "../public-recipes";
import { getPinterestBoard } from "./pinterest-board";
import { PIN_DESCRIPTION_MAX, pinterestCreatePin } from "./pinterest";
import { tiktokCreatorInfo, tiktokInitPost, tiktokPostStatus, type TiktokPostOptions } from "./tiktok";
import { currentPhoto, latestVideo } from "./videos";

export { captionFor } from "./captions";

export interface PublishDeps {
  fetchImpl?: typeof fetch;
  now?: Date;
}

export type PublicationFormat = s.PublicationFormat;
export type TiktokChoices = Omit<TiktokPostOptions, "title">;

export interface PublishOptions {
  /** Légende modifiée par l'administrateur (sinon la légende proposée). */
  caption?: string | null;
  /** Choix exigés par TikTok avant chaque publication. */
  tiktok?: TiktokChoices | null;
}

type MissingRefusal = "not_found" | "no_video" | "no_photo" | "no_carousel" | "outdated";
type AccountRefusal = "not_connected" | "no_board";
type PostRefusal = AccountRefusal | "invalid_format" | "invalid_privacy" | "too_long" | "failed";
type StartRefusal = { ok: false; reason: MissingRefusal | PostRefusal; detail?: string };
export type StartResult = { ok: true } | StartRefusal;

/** Formats possibles par réseau. */
export const FORMATS_BY_PLATFORM: Record<SocialPlatform, readonly PublicationFormat[]> = {
  instagram: ["photo", "carousel", "video"],
  tiktok: ["video"],
  pinterest: ["photo"],
};

async function setPublication(
  db: Database,
  recipeId: string,
  platform: SocialPlatform,
  format: PublicationFormat,
  values: Partial<typeof s.recipePublications.$inferInsert>,
) {
  await db
    .insert(s.recipePublications)
    .values({ recipeId, platform, format, status: "queued", ...values })
    .onConflictDoUpdate({
      target: [s.recipePublications.recipeId, s.recipePublications.platform, s.recipePublications.format],
      set: { ...values, updatedAt: new Date() },
    });
}

function message(error: unknown): string {
  return (error instanceof Error ? error.message : String(error)).slice(0, 500);
}

/**
 * Lance la publication d'une recette sur un réseau, dans un format.
 * Tout ce qui est publié correspond à la photo et à la version actuelles de la recette.
 */
export async function startPublication(
  db: Database,
  adminId: string,
  recipeId: string,
  platform: SocialPlatform,
  format: PublicationFormat,
  options: PublishOptions = {},
  deps: PublishDeps = {},
): Promise<StartResult> {
  const fetchImpl = deps.fetchImpl ?? fetch;
  if (!FORMATS_BY_PLATFORM[platform].includes(format)) return { ok: false, reason: "invalid_format" };
  const recipe = await adminRecipe(db, recipeId);
  const [owner] = await db
    .select({ ownerId: s.recipes.ownerId })
    .from(s.recipes)
    .where(eq(s.recipes.id, recipeId));
  if (!recipe?.versionId || owner?.ownerId !== adminId) return { ok: false, reason: "not_found" };
  // Chaque recette publiée a sa page publique (lien de l'épingle, page « lien en bio »).
  const slug = await ensurePublicPage(db, adminId, recipeId);

  // Ce qui sera publié : la vidéo, le carrousel ou la photo 4:5 de la version actuelle.
  let mediaId: string;
  let durationS = 0;
  if (format === "video") {
    const video = await latestVideo(db, recipeId);
    if (!video) return { ok: false, reason: "no_video" };
    if (!video.current) return { ok: false, reason: "outdated" };
    mediaId = video.id;
    durationS = video.durationS;
  } else if (format === "carousel") {
    const carousel = await latestCarousel(db, recipeId);
    if (!carousel) return { ok: false, reason: "no_carousel" };
    if (!carousel.current) return { ok: false, reason: "outdated" };
    mediaId = carousel.id;
  } else {
    const photo = await currentPhoto(db, recipe.versionId, "4:5");
    if (!photo) return { ok: false, reason: "no_photo" };
    mediaId = photo;
  }

  const account = await accountToken(db, platform, { fetchImpl, now: deps.now }).catch(() => null);
  if (!account) return { ok: false, reason: "not_connected" };
  // Chaque publication renvoie à la page publique de la recette (demande de Julien).
  const written = options.caption?.trim() || (await captionFor(db, recipe.versionId, platform));
  // Instagram : invitation « Commente RECETTE » (lien envoyé en message privé), même sur une légende modifiée.
  const reply = platform === "instagram" ? await getCommentReply(db) : null;
  const linked = slug ? withRecipeLink(written, publicRecipeUrl(appUrl(), slug), platform) : written;
  const caption = (reply?.enabled ? withCommentInvite(linked, reply.keyword) : linked).slice(
    0,
    platform === "pinterest" ? PIN_DESCRIPTION_MAX : MAX_CAPTION,
  );
  const signed = (path: string | null) => {
    if (!path) throw new Error("AGENT_API_KEY manquante : liens signés impossibles.");
    return `${appUrl()}${path}`;
  };

  if (platform === "pinterest") {
    const board = await getPinterestBoard(db);
    if (!board) return { ok: false, reason: "no_board" };
    try {
      const title = await pinTitleFor(db, recipe.versionId);
      const pin = await pinterestCreatePin(
        account.accessToken,
        {
          boardId: board.boardId,
          title,
          description: caption,
          link: `${slug ? publicRecipeUrl(appUrl(), slug) : appUrl()}?utm_source=pinterest&utm_medium=social&utm_campaign=recette`,
          altText: title,
          imageUrl: signed(signedImagePath(mediaId, deps.now)),
        },
        fetchImpl,
      );
      const now = deps.now ?? new Date();
      await setPublication(db, recipeId, platform, format, {
        status: "published",
        externalId: pin.id,
        videoId: mediaId,
        privacy: null,
        postId: pin.id,
        postUrl: pin.url,
        publishedAt: now,
        note: null,
      });
      await audit(db, {
        actorId: adminId,
        action: "publication.published",
        entity: "recipe",
        entityId: recipeId,
        after: { platform, format, mediaId, postUrl: pin.url, board: board.boardName },
      });
      return { ok: true };
    } catch (error) {
      await setPublication(db, recipeId, platform, format, { status: "failed", note: message(error) });
      return { ok: false, reason: "failed", detail: message(error) };
    }
  }

  try {
    let externalId: string;
    let privacy: string | null = null;
    if (platform === "instagram" && format === "photo") {
      externalId = await instagramCreateImage(
        account.accessToken,
        account.accountId,
        { imageUrl: signed(signedImagePath(mediaId, deps.now)), caption },
        fetchImpl,
      );
    } else if (platform === "instagram" && format === "carousel") {
      const carousel = (await latestCarousel(db, recipeId))!;
      const children: string[] = [];
      for (let slide = 1; slide <= carousel.slideCount; slide++) {
        children.push(
          await instagramCreateImage(
            account.accessToken,
            account.accountId,
            { imageUrl: signed(signedSlidePath(mediaId, slide, deps.now)), carouselItem: true },
            fetchImpl,
          ),
        );
      }
      externalId = await instagramCreateCarousel(
        account.accessToken,
        account.accountId,
        { children, caption },
        fetchImpl,
      );
    } else if (platform === "instagram") {
      externalId = await instagramCreateReel(
        account.accessToken,
        account.accountId,
        { videoUrl: signed(signedVideoPath(mediaId, deps.now)), caption },
        fetchImpl,
      );
    } else {
      const choices = options.tiktok;
      if (!choices) return { ok: false, reason: "invalid_privacy" };
      const creator = await tiktokCreatorInfo(account.accessToken, fetchImpl);
      if (!creator.privacyOptions.includes(choices.privacy)) return { ok: false, reason: "invalid_privacy" };
      // Règle de TikTok : un contenu de marque ne peut pas être privé.
      if (choices.brandedContent && choices.privacy === "SELF_ONLY") {
        return { ok: false, reason: "invalid_privacy" };
      }
      if (durationS > creator.maxDurationS) return { ok: false, reason: "too_long" };
      externalId = await tiktokInitPost(
        account.accessToken,
        signed(signedVideoPath(mediaId, deps.now)),
        {
          title: caption,
          privacy: choices.privacy,
          allowComments: choices.allowComments && !creator.commentDisabled,
          allowDuet: choices.allowDuet && !creator.duetDisabled,
          allowStitch: choices.allowStitch && !creator.stitchDisabled,
          promoteOwnBrand: choices.promoteOwnBrand,
          brandedContent: choices.brandedContent,
        },
        fetchImpl,
      );
      privacy = choices.privacy;
    }
    // video_id garde ce qui a été publié (vidéo, carrousel ou photo).
    await setPublication(db, recipeId, platform, format, {
      status: "processing",
      externalId,
      videoId: mediaId,
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
      after: { platform, format, mediaId, privacy },
    });
    return { ok: true };
  } catch (error) {
    await setPublication(db, recipeId, platform, format, { status: "failed", note: message(error) });
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
      after: { platform: row.platform, format: row.format, note },
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
      after: { platform: row.platform, format: row.format, postUrl },
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
