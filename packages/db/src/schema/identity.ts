/**
 * Domaine 1 · Identité et accès.
 * Les tables users, sessions, auth_accounts et verification_tokens sont
 * utilisées par Better Auth (noms de propriétés imposés, en camelCase).
 */
import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { emptyTextArray, id, timestamps, tz } from "./_shared";

export const USER_ROLES = ["user", "admin"] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const users = pgTable(
  "users",
  {
    id: id(),
    name: text("name").notNull().default(""),
    email: text("email").notNull(),
    emailVerified: boolean("email_verified").notNull().default(false),
    image: text("image"),
    // Champs du plugin « admin » de Better Auth
    role: text("role").$type<UserRole>().notNull().default("user"),
    /** Compte suspendu (code révoqué ou suspension manuelle). */
    banned: boolean("banned").notNull().default(false),
    banReason: text("ban_reason"),
    banExpires: tz("ban_expires"),
    // Champs propres à Culinova
    suspendedAt: tz("suspended_at"),
    locale: text("locale").notNull().default("fr"),
    unitSystem: text("unit_system").$type<"metric" | "imperial">().notNull().default("metric"),
    theme: text("theme").$type<"light" | "dark" | "system">().notNull().default("system"),
    avatarKey: text("avatar_key"),
    /** Exceptions de quotas propres à la personne (ex. { "recipes": 10 }). */
    quotaOverrides: jsonb("quota_overrides").$type<Record<string, number | null>>(),
    lastLoginAt: tz("last_login_at"),
    deletedAt: tz("deleted_at"),
    ...timestamps,
  },
  (t) => [uniqueIndex("users_email_unique").on(sql`lower(${t.email})`)],
);

export const sessions = pgTable(
  "sessions",
  {
    id: id(),
    token: text("token").notNull().unique(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expiresAt: tz("expires_at").notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    /** Administrateur connecté « en tant que » cet utilisateur (plugin admin). */
    impersonatedBy: uuid("impersonated_by").references(() => users.id, { onDelete: "set null" }),
    /** Second facteur validé pour cette session (obligatoire pour l'administration). */
    twoFactorVerifiedAt: tz("two_factor_verified_at"),
    ...timestamps,
  },
  (t) => [index("sessions_user_idx").on(t.userId)],
);

/** Comptes de connexion (fournisseurs). Inutilisé en V1 (lien magique), requis par Better Auth. */
export const authAccounts = pgTable(
  "auth_accounts",
  {
    id: id(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: tz("access_token_expires_at"),
    refreshTokenExpiresAt: tz("refresh_token_expires_at"),
    scope: text("scope"),
    password: text("password"),
    ...timestamps,
  },
  (t) => [index("auth_accounts_user_idx").on(t.userId)],
);

/** Jetons temporaires (liens magiques…). Les jetons sont stockés hachés. */
export const verificationTokens = pgTable(
  "verification_tokens",
  {
    id: id(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: tz("expires_at").notNull(),
    ...timestamps,
  },
  (t) => [index("verification_tokens_identifier_idx").on(t.identifier)],
);

/** Compteurs de limitation de débit de Better Auth. */
export const rateLimits = pgTable("rate_limits", {
  id: id(),
  key: text("key").notNull().unique(),
  count: integer("count").notNull(),
  lastRequest: bigint("last_request", { mode: "number" }).notNull(),
});

/** Second facteur (TOTP) des administrateurs. Secret chiffré, codes de secours hachés. */
export const twoFactor = pgTable("two_factor", {
  id: id(),
  userId: uuid("user_id")
    .notNull()
    .unique()
    .references(() => users.id, { onDelete: "cascade" }),
  secretEnc: text("secret_enc").notNull(),
  backupCodesHash: text("backup_codes_hash").array().notNull().default(emptyTextArray),
  /** Null tant que l'enrôlement n'a pas été confirmé par un premier code. */
  enabledAt: tz("enabled_at"),
  failedAttempts: integer("failed_attempts").notNull().default(0),
  lockedUntil: tz("locked_until"),
  lastUsedStep: bigint("last_used_step", { mode: "number" }),
  ...timestamps,
});

/** Tentatives de connexion (demandes de lien, second facteur) pour la limitation et l'audit. */
export const loginAttempts = pgTable(
  "login_attempts",
  {
    id: id(),
    kind: text("kind").$type<"magic_link" | "two_factor" | "invitation" | "invitation_request">().notNull(),
    email: text("email"),
    userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }),
    ip: text("ip"),
    success: boolean("success").notNull(),
    at: tz("at").notNull().defaultNow(),
  },
  (t) => [
    index("login_attempts_email_idx").on(t.kind, t.email, t.at),
    index("login_attempts_ip_idx").on(t.kind, t.ip, t.at),
  ],
);

/** Préférences culinaires de la personne (utilisées par le moteur de recettes). */
export const userProfiles = pgTable("user_profiles", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  diets: text("diets").array().notNull().default(emptyTextArray),
  allergens: text("allergens").array().notNull().default(emptyTextArray),
  dislikedIngredients: text("disliked_ingredients").array().notNull().default(emptyTextArray),
  skillLevel: text("skill_level").$type<"beginner" | "intermediate" | "advanced" | "professional">(),
  ...timestamps,
});
