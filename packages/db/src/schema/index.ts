/**
 * Schéma de la base de données (Drizzle).
 *
 * J0 : seule la table des paramètres applicatifs existe, pour valider la chaîne
 * schéma → migration → client. Le schéma V1 complet (utilisateurs, codes
 * d'invitation, quotas, recettes, ingrédients, prix…) arrive au jalon J1.
 *
 * Conventions : montants en centimes (`*_cents`, entiers), prix au kilo en
 * `numeric(12,4)` exprimés en euros, quantités en g / ml, durées en secondes.
 */
import { jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";

/** Paramètres modifiables depuis l'admin (quotas par défaut, plafond de budget IA…). */
export const appSettings = pgTable("app_settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
