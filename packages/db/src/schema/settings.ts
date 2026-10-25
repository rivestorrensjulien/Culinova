/** Domaine 9 · Paramètres (le contenu éditorial — Lab, catalogue — arrive en phase 2). */
import { boolean, jsonb, pgTable, text, uuid } from "drizzle-orm/pg-core";
import { timestamps } from "./_shared";

/** Clés des paramètres modifiables depuis l'admin. */
export const SETTING_KEYS = {
  defaultQuotas: "quotas.defaults",
  monthlyAiBudget: "ai.monthly_budget_usd_micros",
  /** Identité de l'éditeur, reprise dans les mentions légales et la politique de confidentialité. */
  legalIdentity: "legal.identity",
  /** Recettes de l'administrateur dont la photo est montrée sur la page d'accueil (liste d'identifiants). */
  homeShowcase: "home.showcase",
  /** Réglages des légendes des réseaux : comptes à mentionner, mention « photo générée par IA ». */
  socialCaptions: "social.captions",
  /** Pinterest : tableau où sont épinglées les recettes. */
  socialPinterest: "social.pinterest",
  /** Planification automatique des publications (recettes choisies par l'agent, à valider). */
  socialAutoplan: "social.autoplan",
  /** « Commente RECETTE » : mot-clé qui déclenche l'envoi du lien en message privé sur Instagram. */
  socialCommentReply: "social.comment_reply",
  /** « Commente RECETTE » : compte rendu du dernier passage (publications, commentaires, erreur). */
  socialCommentReplyStatus: "social.comment_reply_status",
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
