/** Domaine 9 · Paramètres (le contenu éditorial — Lab, catalogue — arrive en phase 2). */
import { boolean, jsonb, pgTable, text, uuid } from "drizzle-orm/pg-core";
import { timestamps } from "./_shared";

/** Clés des paramètres modifiables depuis l'admin. */
export const SETTING_KEYS = {
  defaultQuotas: "quotas.defaults",
  monthlyAiBudget: "ai.monthly_budget_usd_micros",
} as const;

/** Paramètres modifiables depuis l'admin (quotas par défaut, plafond de budget IA…). */
export const siteSettings = pgTable("site_settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull(),
  ...timestamps,
});

export const featureFlags = pgTable("feature_flags", {
  key: text("key").primaryKey(),
  enabled: boolean("enabled").notNull().default(false),
  planIds: uuid("plan_ids").array(),
  ...timestamps,
});
