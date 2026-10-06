/**
 * Domaine 2 · Accès V1 (sur invitation), quotas et budget IA.
 * Les tables de vente (abonnements, paiements, factures…) arrivent en phase 2, par ajout.
 */
import { sql } from "drizzle-orm";
import { bigint, boolean, index, integer, jsonb, pgTable, primaryKey, text, uuid } from "drizzle-orm/pg-core";
import { id, timestamps, tz } from "./_shared";
import { users } from "./identity";

/** Offres. En V1, une seule offre « invitation » porte les quotas. */
export const subscriptionPlans = pgTable("subscription_plans", {
  id: id(),
  code: text("code").notNull().unique(),
  tier: text("tier").$type<"invitation" | "free" | "premium" | "pro" | "business">().notNull(),
  name: text("name").notNull(),
  features: jsonb("features").$type<Record<string, unknown>>().notNull().default({}),
  quotas: jsonb("quotas").$type<Record<string, number | null>>().notNull().default({}),
  trialDays: integer("trial_days").notNull().default(0),
  isPublic: boolean("is_public").notNull().default(false),
  sortOrder: integer("sort_order").notNull().default(0),
  active: boolean("active").notNull().default(true),
  ...timestamps,
});

/** Codes d'invitation individuels. Le code n'est jamais stocké en clair. */
export const invitations = pgTable(
  "invitations",
  {
    id: id(),
    codeHash: text("code_hash").notNull().unique(),
    /** Derniers caractères du code, pour l'identifier dans l'admin. */
    codeHint: text("code_hint").notNull(),
    label: text("label"),
    /** Invitation nominative : seule cette adresse peut l'utiliser. */
    email: text("email"),
    planId: uuid("plan_id").references(() => subscriptionPlans.id),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    expiresAt: tz("expires_at"),
    /** Réservation le temps de cliquer sur le lien magique (évite qu'une faute de frappe « brûle » le code). */
    reservedEmail: text("reserved_email"),
    reservedAt: tz("reserved_at"),
    reservedName: text("reserved_name"),
    reservedConsents: jsonb("reserved_consents").$type<{
      documentIds: string[];
      locale?: string;
      ip: string | null;
      userAgent: string | null;
    }>(),
    redeemedBy: uuid("redeemed_by")
      .unique()
      .references(() => users.id, { onDelete: "set null" }),
    redeemedAt: tz("redeemed_at"),
    revokedAt: tz("revoked_at"),
    revokedBy: uuid("revoked_by").references(() => users.id, { onDelete: "set null" }),
    quotaOverrides: jsonb("quota_overrides").$type<Record<string, number | null>>(),
    sentAt: tz("sent_at"),
    ...timestamps,
  },
  (t) => [index("invitations_reserved_email_idx").on(sql`lower(${t.reservedEmail})`)],
);

/** Demandes d'invitation reçues depuis la page d'accueil (J8). */
export const invitationRequests = pgTable("invitation_requests", {
  id: id(),
  name: text("name").notNull(),
  email: text("email").notNull(),
  message: text("message"),
  status: text("status").$type<"pending" | "invited" | "declined">().notNull().default("pending"),
  invitationId: uuid("invitation_id").references(() => invitations.id, { onDelete: "set null" }),
  ...timestamps,
});

/**
 * Compteurs de consommation. `subject_id` = personne (quotas mensuels) ou
 * recette (régénérations) ; `period` = « 2026-10 » ou « lifetime ».
 */
export const usageCounters = pgTable(
  "usage_counters",
  {
    subjectType: text("subject_type").$type<"user" | "recipe">().notNull(),
    subjectId: uuid("subject_id").notNull(),
    metric: text("metric").notNull(),
    period: text("period").notNull(),
    count: integer("count").notNull().default(0),
    ...timestamps,
  },
  (t) => [primaryKey({ columns: [t.subjectType, t.subjectId, t.metric, t.period] })],
);

/**
 * Budget IA global par mois. Montants en micro-dollars (1 $ = 1 000 000),
 * car les fournisseurs d'IA facturent en dollars et par fractions de centime.
 */
export const aiBudgets = pgTable("ai_budgets", {
  period: text("period").primaryKey(),
  capUsdMicros: bigint("cap_usd_micros", { mode: "number" }),
  spentUsdMicros: bigint("spent_usd_micros", { mode: "number" }).notNull().default(0),
  pausedAt: tz("paused_at"),
  ...timestamps,
});

/** Journal des connexions « en tant que » (tracées aussi dans audit_logs). */
export const impersonationSessions = pgTable("impersonation_sessions", {
  id: id(),
  adminId: uuid("admin_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  reason: text("reason"),
  startedAt: tz("started_at").notNull().defaultNow(),
  endedAt: tz("ended_at"),
});
