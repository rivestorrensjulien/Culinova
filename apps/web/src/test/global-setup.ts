/** Remet la base de test à zéro, applique les migrations et les données de référence. */
import { createDb } from "@culinova/db";
import { resetTestDatabase, runMigrations } from "@culinova/db/migrate";
import { seed } from "@culinova/db/seed";
import { loadTestEnv, testDatabaseUrl } from "./env";

export default async function setup(): Promise<void> {
  loadTestEnv();
  const url = testDatabaseUrl();
  if (!url) {
    console.warn("⚠ DATABASE_URL_TEST non définie : les tests d'intégration (base de données) sont ignorés.");
    return;
  }
  await resetTestDatabase(url);
  await runMigrations(url);
  const db = createDb(url);
  await seed(db);
  await db.$client.end();
}
