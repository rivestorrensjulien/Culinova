import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

export { schema };
export type Database = PostgresJsDatabase<typeof schema> & { $client: postgres.Sql };

/**
 * Crée un client de base de données. L'URL vient de la variable d'environnement
 * DATABASE_URL (jamais en dur).
 */
export function createDb(url = process.env.DATABASE_URL): Database {
  if (!url) {
    throw new Error("DATABASE_URL n'est pas définie (voir .env.example).");
  }
  // `prepare: false` : requis par le pooler de connexions de Supabase (mode transaction).
  const client = postgres(url, { prepare: false });
  return drizzle(client, { schema });
}
