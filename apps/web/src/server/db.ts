import { createDb, type Database } from "@culinova/db";

const globalForDb = globalThis as unknown as { culinovaDb?: Database };

/** Connexion unique à la base (réutilisée entre les rechargements à chaud en développement). */
export function getDb(): Database {
  globalForDb.culinovaDb ??= createDb();
  return globalForDb.culinovaDb;
}
