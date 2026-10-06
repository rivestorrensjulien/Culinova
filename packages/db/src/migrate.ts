/** Applique les migrations en attente : `pnpm db:migrate`. */
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { fileURLToPath } from "node:url";
import postgres from "postgres";
import { loadRootEnv } from "./env";

export async function runMigrations(url: string): Promise<void> {
  const client = postgres(url, { max: 1, onnotice: () => {} });
  try {
    await migrate(drizzle(client), {
      migrationsFolder: fileURLToPath(new URL("../drizzle", import.meta.url)),
    });
  } finally {
    await client.end();
  }
}

/** Vide entièrement une base (tests uniquement : le nom de la base doit contenir « test »). */
export async function resetTestDatabase(url: string): Promise<void> {
  if (!/test/i.test(new URL(url).pathname)) {
    throw new Error("Par sécurité, seule une base dont le nom contient « test » peut être vidée.");
  }
  const client = postgres(url, { max: 1, onnotice: () => {} });
  try {
    await client.unsafe(
      "drop schema if exists public cascade; drop schema if exists drizzle cascade; create schema public;",
    );
  } finally {
    await client.end();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  loadRootEnv();
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL n'est pas définie (voir .env.example).");
  await runMigrations(url);
  console.log("✓ Migrations appliquées");
}
