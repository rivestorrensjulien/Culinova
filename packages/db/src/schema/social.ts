/**
 * Agent de publication : vidéos des recettes, comptes Instagram et TikTok reliés
 * (jetons chiffrés), statistiques relevées chaque jour.
 */
import { index, integer, jsonb, pgTable, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { emptyTextArray, id, timestamps, tz } from "./_shared";
import { users } from "./identity";
import { type PublicationPlatform, recipePublications, recipes, recipeVersions } from "./recipes";

/**
 * Vidéo verticale d'une version de recette, fabriquée par l'agent (dossier agent/) :
 * envoi en cours, prête (visible par l'administrateur) ou en échec.
 */
export const recipeVideos = pgTable(
  "recipe_videos",
  {
    id: id(),
    recipeId: uuid("recipe_id")
      .notNull()
      .references(() => recipes.id, { onDelete: "cascade" }),
    recipeVersionId: uuid("recipe_version_id")
      .notNull()
      .references(() => recipeVersions.id, { onDelete: "cascade" }),
    status: text("status").$type<"uploading" | "ready" | "failed">().notNull().default("uploading"),
    storageKey: text("storage_key").notNull(),
    /** Photo 9:16 montrée dans la vidéo : si la photo de la recette change, la vidéo est refaite. */
    imageId: uuid("image_id"),
    durationMs: integer("duration_ms").notNull(),
    width: integer("width").notNull(),
    height: integer("height").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    note: text("note"),
    /** Format de la vidéo : eclate, coupe, dessus, geste (format court) ou animee (ancienne vidéo animée). */
    format: text("format"),
    ...timestamps,
  },
  (t) => [index("recipe_videos_recipe_idx").on(t.recipeId, t.createdAt)],
);

/**
 * Vidéo demandée par l'administrateur depuis l'encart : refaire la vidéo, dans un format choisi
 * (null = format choisi par l'analyse du plat). L'agent la refait au passage suivant.
 */
export const recipeVideoRequests = pgTable("recipe_video_requests", {
  recipeId: uuid("recipe_id")
    .primaryKey()
    .references(() => recipes.id, { onDelete: "cascade" }),
  format: text("format"),
  requestedAt: tz("requested_at").notNull().defaultNow(),
  requestedBy: uuid("requested_by").references(() => users.id, { onDelete: "set null" }),
});

/**
 * Carrousel Instagram d'une version de recette, fabriqué par l'agent : photo, ingrédients,
 * étapes, puis carte de fin (JPEG 1080 × 1350, dans le compartiment des vidéos).
 */
export const recipeCarousels = pgTable(
  "recipe_carousels",
  {
    id: id(),
    recipeId: uuid("recipe_id")
      .notNull()
      .references(() => recipes.id, { onDelete: "cascade" }),
    recipeVersionId: uuid("recipe_version_id")
      .notNull()
      .references(() => recipeVersions.id, { onDelete: "cascade" }),
    imageId: uuid("image_id"),
    status: text("status").$type<"uploading" | "ready" | "failed">().notNull().default("uploading"),
    slideCount: integer("slide_count").notNull(),
    /** Dossier des images : <prefix>/01.jpg, 02.jpg… */
    storagePrefix: text("storage_prefix").notNull(),
    note: text("note"),
    ...timestamps,
  },
  (t) => [index("recipe_carousels_recipe_idx").on(t.recipeId, t.createdAt)],
);

/** Compte Instagram ou TikTok relié par l'administrateur (un par réseau). */
export const socialAccounts = pgTable(
  "social_accounts",
  {
    id: id(),
    platform: text("platform").$type<PublicationPlatform>().notNull(),
    /** Identifiant du compte (Instagram user_id, TikTok open_id). */
    accountId: text("account_id").notNull(),
    username: text("username"),
    /** Jetons chiffrés (AES-256-GCM, clé SOCIAL_TOKEN_KEY), jamais en clair. */
    accessTokenEnc: text("access_token_enc").notNull(),
    refreshTokenEnc: text("refresh_token_enc"),
    expiresAt: tz("expires_at"),
    refreshExpiresAt: tz("refresh_expires_at"),
    scopes: text("scopes").array().notNull().default(emptyTextArray),
    connectedBy: uuid("connected_by").references(() => users.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (t) => [uniqueIndex("social_accounts_platform_unique").on(t.platform)],
);

/** Statistiques d'une publication, relevées une fois par jour. */
export const socialPostStats = pgTable(
  "social_post_stats",
  {
    id: id(),
    publicationId: uuid("publication_id")
      .notNull()
      .references(() => recipePublications.id, { onDelete: "cascade" }),
    collectedAt: tz("collected_at").notNull().defaultNow(),
    views: integer("views"),
    reach: integer("reach"),
    likes: integer("likes"),
    comments: integer("comments"),
    shares: integer("shares"),
    saves: integer("saves"),
    raw: jsonb("raw"),
  },
  (t) => [index("social_post_stats_publication_idx").on(t.publicationId, t.collectedAt)],
);

/** Statistiques d'un compte (abonnés…), relevées une fois par jour. */
export const socialAccountStats = pgTable(
  "social_account_stats",
  {
    id: id(),
    platform: text("platform").$type<PublicationPlatform>().notNull(),
    collectedAt: tz("collected_at").notNull().defaultNow(),
    followers: integer("followers"),
    posts: integer("posts"),
    likes: integer("likes"),
    raw: jsonb("raw"),
  },
  (t) => [index("social_account_stats_platform_idx").on(t.platform, t.collectedAt)],
);

/**
 * Page publique d'une recette d'administrateur (culinova.fr/recette/<slug>) : la recette du nom
 * aux conseils, sans prix ni marges, pour les liens des réseaux sociaux. Supprimer la ligne
 * retire la page.
 */
export const recipePublicPages = pgTable(
  "recipe_public_pages",
  {
    recipeId: uuid("recipe_id")
      .primaryKey()
      .references(() => recipes.id, { onDelete: "cascade" }),
    /** Adresse lisible et non devinable : nom de la recette + 4 caractères au hasard. */
    slug: text("slug").notNull(),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (t) => [uniqueIndex("recipe_public_pages_slug_unique").on(t.slug)],
);

/**
 * « Commente RECETTE » (demande de Julien du 24/10) : chaque commentaire Instagram contenant le
 * mot-clé reçoit une seule fois le lien de la recette en message privé (lien cliquable).
 */
export const instagramCommentReplies = pgTable(
  "instagram_comment_replies",
  {
    /** Identifiant du commentaire chez Instagram : jamais deux messages pour un même commentaire. */
    commentId: text("comment_id").primaryKey(),
    recipeId: uuid("recipe_id").references(() => recipes.id, { onDelete: "set null" }),
    mediaId: text("media_id").notNull(),
    username: text("username"),
    /** « sending », « sent » ou « failed ». */
    status: text("status").$type<"sending" | "sent" | "failed">().notNull().default("sending"),
    note: text("note"),
    ...timestamps,
  },
  (t) => [index("instagram_comment_replies_created_idx").on(t.createdAt)],
);
