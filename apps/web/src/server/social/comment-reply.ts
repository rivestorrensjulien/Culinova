/**
 * « Commente RECETTE » (demande de Julien du 24/10) : les légendes Instagram invitent à commenter
 * un mot-clé ; toutes les 10 minutes (`/api/agent/programmation`), Culinova lit les commentaires
 * des publications Instagram des 7 derniers jours et envoie à chaque personne qui a écrit le
 * mot-clé un message privé avec le lien cliquable de la recette (une seule fois par commentaire,
 * comme l'exige Instagram), puis répond sous le commentaire « Envoyé en message privé ».
 */
import type { Database } from "@culinova/db";
import * as s from "@culinova/db/schema";
import { and, count, desc, eq, gte, inArray, isNotNull } from "drizzle-orm";
import { audit } from "../audit";
import { appUrl } from "../auth";
import { accountToken } from "./accounts";
import { instagramComments, instagramPrivateReply, instagramReplyToComment } from "./instagram";

export interface CommentReplySettings {
  enabled: boolean;
  /** Mot-clé en majuscules, sans espace (« RECETTE »). */
  keyword: string;
}

export const DEFAULT_COMMENT_REPLY: CommentReplySettings = { enabled: true, keyword: "RECETTE" };

/** Instagram : une réponse privée possible dans les 7 jours qui suivent le commentaire. */
const REPLY_WINDOW_MS = 7 * 24 * 3600 * 1000;

/** « Recette ! », « recette stp », « RÉCETTE » → le mot-clé est reconnu. */
export function normalizeKeyword(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 30);
}

export function matchesKeyword(text: string, keyword: string): boolean {
  const word = normalizeKeyword(keyword);
  if (!word) return false;
  const words = text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toUpperCase()
    .split(/[^A-Z0-9]+/);
  return words.includes(word);
}

/** Ligne de la légende Instagram qui invite à commenter le mot-clé. */
export function commentInviteLine(keyword: string): string {
  return `💬 Commente « ${normalizeKeyword(keyword)} » et je t'envoie le lien de la recette en message privé 📩`;
}

const INVITE_PREFIX = "💬 Commente « ";

/** Ajoute l'invitation à une légende Instagram (aussi modifiée à la main), avant le lien de la recette. */
export function withCommentInvite(caption: string, keyword: string): string {
  if (caption.includes(INVITE_PREFIX)) return caption;
  const line = commentInviteLine(keyword);
  const parts = caption.split("\n\n");
  const tailStart = parts.findIndex((part, i) => i > 0 && /^[🔗@#📸]/u.test(part.trim()));
  if (tailStart === -1) return [caption, line].join("\n\n");
  return [...parts.slice(0, tailStart), line, ...parts.slice(tailStart)].join("\n\n");
}

export async function getCommentReply(db: Database): Promise<CommentReplySettings> {
  const [row] = await db
    .select({ value: s.siteSettings.value })
    .from(s.siteSettings)
    .where(eq(s.siteSettings.key, s.SETTING_KEYS.socialCommentReply));
  const value = (row?.value ?? {}) as Partial<CommentReplySettings>;
  const keyword = normalizeKeyword(value.keyword ?? "") || DEFAULT_COMMENT_REPLY.keyword;
  return { enabled: value.enabled ?? DEFAULT_COMMENT_REPLY.enabled, keyword };
}

export async function saveCommentReply(db: Database, adminId: string, settings: CommentReplySettings) {
  const value = {
    enabled: settings.enabled,
    keyword: normalizeKeyword(settings.keyword) || DEFAULT_COMMENT_REPLY.keyword,
  };
  await db
    .insert(s.siteSettings)
    .values({ key: s.SETTING_KEYS.socialCommentReply, value })
    .onConflictDoUpdate({ target: s.siteSettings.key, set: { value, updatedAt: new Date() } });
  await audit(db, { actorId: adminId, action: "social.comment_reply", entity: "site_setting", after: value });
}

/** Message privé envoyé : le lien de la page publique de la recette (cliquable dans les messages). */
export function replyMessage(input: { username: string | null; name: string; url: string }): string {
  const hello = input.username ? `Salut @${input.username} 👋` : "Salut 👋";
  return [
    hello,
    `Voici la recette complète « ${input.name} », pesée au gramme :`,
    input.url,
    "Bonne cuisine ! Chef Ju 👨‍🍳",
  ].join("\n\n");
}

export const PUBLIC_REPLY = "Envoyé en message privé 📩";

export interface ReplyOutcome {
  sent: number;
  failed: number;
}

/**
 * Lit les commentaires des publications Instagram des 7 derniers jours et envoie le lien de la
 * recette à chaque nouveau commentaire contenant le mot-clé.
 */
export async function replyToComments(
  db: Database,
  deps: { fetchImpl?: typeof fetch; now?: Date } = {},
): Promise<ReplyOutcome> {
  const fetchImpl = deps.fetchImpl ?? fetch;
  const now = deps.now ?? new Date();
  const outcome: ReplyOutcome = { sent: 0, failed: 0 };
  const settings = await getCommentReply(db);
  if (!settings.enabled) return outcome;
  const posts = await db
    .select({
      recipeId: s.recipePublications.recipeId,
      mediaId: s.recipePublications.postId,
      slug: s.recipePublicPages.slug,
      name: s.recipeVersions.name,
      ownerId: s.recipes.ownerId,
    })
    .from(s.recipePublications)
    .innerJoin(s.recipes, eq(s.recipes.id, s.recipePublications.recipeId))
    .innerJoin(s.recipeVersions, eq(s.recipeVersions.id, s.recipes.currentVersionId))
    .leftJoin(s.recipePublicPages, eq(s.recipePublicPages.recipeId, s.recipePublications.recipeId))
    .where(
      and(
        eq(s.recipePublications.platform, "instagram"),
        eq(s.recipePublications.status, "published"),
        isNotNull(s.recipePublications.postId),
        gte(s.recipePublications.publishedAt, new Date(now.getTime() - REPLY_WINDOW_MS)),
      ),
    );
  if (posts.length === 0) return outcome;
  const account = await accountToken(db, "instagram", { fetchImpl, now }).catch(() => null);
  if (!account) return outcome;

  for (const post of posts) {
    if (!post.mediaId) continue;
    const comments = await instagramComments(account.accessToken, post.mediaId, fetchImpl).catch(() => []);
    const wanted = comments.filter(
      (c) =>
        c.fromId !== account.accountId &&
        (!account.username || c.username !== account.username) &&
        now.getTime() - new Date(c.timestamp).getTime() < REPLY_WINDOW_MS &&
        matchesKeyword(c.text, settings.keyword),
    );
    if (wanted.length === 0) continue;
    const already = await db
      .select({ id: s.instagramCommentReplies.commentId })
      .from(s.instagramCommentReplies)
      .where(
        inArray(
          s.instagramCommentReplies.commentId,
          wanted.map((c) => c.id),
        ),
      );
    const done = new Set(already.map((a) => a.id));
    // Page publique de la recette (créée si besoin) : c'est elle qu'on envoie.
    let slug = post.slug;
    if (!slug) {
      const { ensurePublicPage } = await import("../public-recipes");
      slug = await ensurePublicPage(db, post.ownerId, post.recipeId);
    }
    const url = slug
      ? `${appUrl()}/recette/${slug}?utm_source=instagram&utm_medium=message&utm_campaign=commente`
      : `${appUrl()}/recettes`;
    for (const comment of wanted) {
      if (done.has(comment.id)) continue;
      // Réservation : un seul envoi par commentaire, même si deux passages se croisent.
      const [claimed] = await db
        .insert(s.instagramCommentReplies)
        .values({
          commentId: comment.id,
          recipeId: post.recipeId,
          mediaId: post.mediaId,
          username: comment.username,
        })
        .onConflictDoNothing()
        .returning({ id: s.instagramCommentReplies.commentId });
      if (!claimed) continue;
      try {
        await instagramPrivateReply(
          account.accessToken,
          account.accountId,
          comment.id,
          replyMessage({ username: comment.username, name: post.name, url }),
          fetchImpl,
        );
        await db
          .update(s.instagramCommentReplies)
          .set({ status: "sent", updatedAt: now })
          .where(eq(s.instagramCommentReplies.commentId, comment.id));
        // Réponse publique : les autres voient que ça marche (sans bloquer si elle échoue).
        await instagramReplyToComment(account.accessToken, comment.id, PUBLIC_REPLY, fetchImpl).catch(
          () => {},
        );
        outcome.sent++;
      } catch (error) {
        const note = (error instanceof Error ? error.message : String(error)).slice(0, 500);
        await db
          .update(s.instagramCommentReplies)
          .set({ status: "failed", note, updatedAt: now })
          .where(eq(s.instagramCommentReplies.commentId, comment.id));
        outcome.failed++;
      }
    }
  }
  return outcome;
}

/** Messages envoyés et échecs des 30 derniers jours (page Administration › Réseaux). */
export async function commentReplyStats(db: Database, now: Date = new Date()) {
  const since = new Date(now.getTime() - 30 * 24 * 3600 * 1000);
  const rows = await db
    .select({ status: s.instagramCommentReplies.status, n: count() })
    .from(s.instagramCommentReplies)
    .where(gte(s.instagramCommentReplies.createdAt, since))
    .groupBy(s.instagramCommentReplies.status);
  const [lastFailure] = await db
    .select({ note: s.instagramCommentReplies.note })
    .from(s.instagramCommentReplies)
    .where(
      and(eq(s.instagramCommentReplies.status, "failed"), gte(s.instagramCommentReplies.createdAt, since)),
    )
    .orderBy(desc(s.instagramCommentReplies.updatedAt))
    .limit(1);
  return {
    sent: rows.find((r) => r.status === "sent")?.n ?? 0,
    failed: rows.find((r) => r.status === "failed")?.n ?? 0,
    lastFailure: lastFailure?.note ?? null,
  };
}
