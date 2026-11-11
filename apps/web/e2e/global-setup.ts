import { eq } from "drizzle-orm";
import { createDb } from "@culinova/db";
import { resetTestDatabase, runMigrations } from "@culinova/db/migrate";
import { ensureAdmin, seed } from "@culinova/db/seed";
import { rm } from "node:fs/promises";
import { users } from "@culinova/db/schema";
import { ADMIN_EMAIL, COOK_EMAIL } from "./helpers";

export default async function globalSetup(): Promise<void> {
  const url = process.env.DATABASE_URL_E2E!;
  await resetTestDatabase(url);
  await runMigrations(url);
  const db = createDb(url);
  await seed(db);
  await ensureAdmin(db, ADMIN_EMAIL);
  // Le test hors ligne parcourt l'assistant pro en 12 étapes.
  await db.update(users).set({ proMode: true }).where(eq(users.email, ADMIN_EMAIL));
  // Une personne déjà inscrite (le parcours d'invitation est testé à part).
  // Le parcours principal teste les outils pro (prix de vente, fiche technique) : compte en mode pro.
  await db.insert(users).values({ email: COOK_EMAIL, name: "Camille", emailVerified: true, proMode: true });
  await db.$client.end();
  await rm(process.env.EMAIL_OUTBOX_DIR!, { recursive: true, force: true });
}
