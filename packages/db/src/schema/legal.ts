/** Domaine 3 · Juridique, conformité, notifications, audit. */
import { boolean, index, jsonb, pgTable, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { id, timestamps, tz } from "./_shared";
import { users } from "./identity";

export const LEGAL_DOCUMENT_TYPES = [
  "cgu",
  "privacy",
  "cookies",
  "legal_notice",
  "cgv",
  "subscription_policy",
  "mediator",
] as const;
export type LegalDocumentType = (typeof LEGAL_DOCUMENT_TYPES)[number];

export const legalDocuments = pgTable(
  "legal_documents",
  {
    id: id(),
    type: text("type").$type<LegalDocumentType>().notNull(),
    version: text("version").notNull(),
    locale: text("locale").notNull().default("fr"),
    title: text("title").notNull(),
    bodyMd: text("body_md").notNull(),
    publishedAt: tz("published_at"),
    isCurrent: boolean("is_current").notNull().default(false),
    ...timestamps,
  },
  (t) => [uniqueIndex("legal_documents_version_unique").on(t.type, t.locale, t.version)],
);

/** Preuve d'acceptation d'un document (CGU, confidentialité…). */
export const consentRecords = pgTable(
  "consent_records",
  {
    id: id(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    legalDocumentId: uuid("legal_document_id")
      .notNull()
      .references(() => legalDocuments.id),
    consentType: text("consent_type").notNull(),
    granted: boolean("granted").notNull(),
    context: text("context").$type<"signup" | "update" | "banner" | "checkout">().notNull(),
    ip: text("ip"),
    userAgent: text("user_agent"),
    at: tz("at").notNull().defaultNow(),
  },
  (t) => [index("consent_records_user_idx").on(t.userId)],
);

export const cookieConsents = pgTable("cookie_consents", {
  id: id(),
  anonymousId: text("anonymous_id"),
  userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }),
  categories: jsonb("categories").$type<Record<string, boolean>>().notNull(),
  at: tz("at").notNull().defaultNow(),
});

/** Demandes RGPD (export ou suppression des données). */
export const dataRequests = pgTable("data_requests", {
  id: id(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  kind: text("kind").$type<"export" | "deletion">().notNull(),
  status: text("status").$type<"pending" | "processing" | "done" | "failed">().notNull().default("pending"),
  fileKey: text("file_key"),
  completedAt: tz("completed_at"),
  ...timestamps,
});

/** Registre des traitements (RGPD). */
export const processingRegister = pgTable("processing_register", {
  id: id(),
  purpose: text("purpose").notNull(),
  legalBasis: text("legal_basis").notNull(),
  dataCategories: text("data_categories").array().notNull(),
  retention: text("retention").notNull(),
  processors: text("processors").array().notNull(),
  ...timestamps,
});

export const notifications = pgTable(
  "notifications",
  {
    id: id(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    channel: text("channel").$type<"email" | "in_app">().notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default({}),
    sentAt: tz("sent_at"),
    readAt: tz("read_at"),
    ...timestamps,
  },
  (t) => [index("notifications_user_idx").on(t.userId)],
);

export const emailTemplates = pgTable(
  "email_templates",
  {
    id: id(),
    key: text("key").notNull(),
    locale: text("locale").notNull(),
    subject: text("subject").notNull(),
    version: text("version").notNull(),
    active: boolean("active").notNull().default(true),
    ...timestamps,
  },
  (t) => [uniqueIndex("email_templates_unique").on(t.key, t.locale, t.version)],
);

/** Journal d'audit des actions sensibles. Jamais modifié, jamais supprimé. */
export const auditLogs = pgTable(
  "audit_logs",
  {
    id: id(),
    actorId: uuid("actor_id").references(() => users.id, { onDelete: "set null" }),
    /** Administrateur réellement aux commandes lors d'un « se connecter en tant que ». */
    impersonatorId: uuid("impersonator_id").references(() => users.id, { onDelete: "set null" }),
    action: text("action").notNull(),
    entity: text("entity").notNull(),
    entityId: text("entity_id"),
    before: jsonb("before"),
    after: jsonb("after"),
    ip: text("ip"),
    userAgent: text("user_agent"),
    at: tz("at").notNull().defaultNow(),
  },
  (t) => [index("audit_logs_at_idx").on(t.at), index("audit_logs_entity_idx").on(t.entity, t.entityId)],
);
