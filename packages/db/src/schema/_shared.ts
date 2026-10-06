import { sql } from "drizzle-orm";
import { timestamp, uuid } from "drizzle-orm/pg-core";

/** Clé primaire UUID générée par la base. */
export const id = () => uuid("id").primaryKey().defaultRandom();

/** Date avec fuseau horaire (toujours stockée en UTC). */
export const tz = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });

/** Colonnes created_at / updated_at présentes sur toutes les tables. */
export const timestamps = {
  createdAt: tz("created_at").notNull().defaultNow(),
  updatedAt: tz("updated_at")
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
};

/** Tableau de texte vide par défaut (allergènes, régimes, matériel…). */
export const emptyTextArray = sql`'{}'::text[]`;
