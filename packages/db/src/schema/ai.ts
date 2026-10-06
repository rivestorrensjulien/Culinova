/** Domaine 7 · Génération IA. Coûts en micro-dollars (1 $ = 1 000 000). */
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
import { languages } from "./culinary";
import { users } from "./identity";
import { recipeVersions } from "./recipes";

export const AI_GENERATION_KINDS = [
  "recipe",
  "regeneration",
  "image",
  "social",
  "analysis",
  "translation",
  "edit",
  "invoice_scan",
] as const;
export type AiGenerationKind = (typeof AI_GENERATION_KINDS)[number];

export const aiGenerations = pgTable(
  "ai_generations",
  {
    id: id(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    kind: text("kind").$type<AiGenerationKind>().notNull(),
    status: text("status").$type<"queued" | "running" | "succeeded" | "failed">().notNull().default("queued"),
    /** Cible de la génération (recette, version, image…), sous forme « type:id ». */
    inputRef: text("input_ref"),
    output: jsonb("output"),
    provider: text("provider"),
    model: text("model"),
    promptVersion: text("prompt_version"),
    tokensIn: integer("tokens_in"),
    tokensOut: integer("tokens_out"),
    costUsdMicros: bigint("cost_usd_micros", { mode: "number" }).notNull().default(0),
    error: text("error"),
    startedAt: tz("started_at"),
    finishedAt: tz("finished_at"),
    ...timestamps,
  },
  (t) => [index("ai_generations_user_idx").on(t.userId, t.createdAt)],
);

/** Paramètres IA administrables (modèle, prompt versionné). */
export const aiSettings = pgTable(
  "ai_settings",
  {
    id: id(),
    key: text("key").notNull(),
    provider: text("provider").notNull(),
    model: text("model").notNull(),
    promptTemplate: text("prompt_template"),
    version: text("version").notNull(),
    active: boolean("active").notNull().default(false),
    ...timestamps,
  },
  (t) => [uniqueIndex("ai_settings_unique").on(t.key, t.version)],
);

/** Analyse d'une recette : propositions appliquées seulement après validation. */
export const recipeAnalyses = pgTable("recipe_analyses", {
  id: id(),
  recipeVersionId: uuid("recipe_version_id")
    .notNull()
    .references(() => recipeVersions.id, { onDelete: "cascade" }),
  findings: jsonb("findings").notNull(),
  proposedChanges: jsonb("proposed_changes"),
  decision: text("decision").$type<"pending" | "accepted" | "rejected">().notNull().default("pending"),
  decidedAt: tz("decided_at"),
  ...timestamps,
});

export const socialContents = pgTable("social_contents", {
  id: id(),
  recipeVersionId: uuid("recipe_version_id")
    .notNull()
    .references(() => recipeVersions.id, { onDelete: "cascade" }),
  platform: text("platform").$type<"instagram" | "tiktok" | "pinterest" | "linkedin" | "generic">().notNull(),
  languageCode: text("language_code")
    .notNull()
    .references(() => languages.code),
  title: text("title"),
  description: text("description"),
  caption: text("caption"),
  hashtags: text("hashtags").array().notNull().default(emptyTextArray),
  ...timestamps,
});
