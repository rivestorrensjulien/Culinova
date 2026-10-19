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
    ...timestamps,
  },
  (t) => [index("recipe_videos_recipe_idx").on(t.recipeId, t.createdAt)],
);

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
