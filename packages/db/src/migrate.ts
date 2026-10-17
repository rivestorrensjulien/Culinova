/** Applique les migrations en attente : `pnpm db:migrate`. */
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { fileURLToPath } from "node:url";
import postgres from "postgres";
import { loadRootEnv } from "./env";

/**
 * Verrouille l'accès direct aux tables par l'API publique de Supabase (PostgREST) :
 * sécurité au niveau des lignes (RLS) activée sur toutes les tables, sans aucune règle,
 * et droits retirés aux rôles publics `anon` et `authenticated`. Culinova n'utilise pas
 * cette API : l'application se connecte directement en tant que propriétaire des tables,
 * qui n'est pas concerné par la RLS. Relancé après chaque migration (tables nouvelles comprises).
 */
export const LOCKDOWN_SQL = `
do $$
declare
  t record;
begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('alter table public.%I enable row level security', t.tablename);
  end loop;
  if exists (select 1 from pg_roles where rolname = 'anon')
     and exists (select 1 from pg_roles where rolname = 'authenticated') then
    revoke all on all tables in schema public from anon, authenticated;
    revoke all on all sequences in schema public from anon, authenticated;
    revoke all on all functions in schema public from anon, authenticated;
    alter default privileges in schema public revoke all on tables from anon, authenticated;
    alter default privileges in schema public revoke all on sequences from anon, authenticated;
    alter default privileges in schema public revoke all on functions from anon, authenticated;
  end if;
end
$$;`;

export async function runMigrations(url: string): Promise<void> {
  // `prepare: false` : le pooler de connexions de Supabase (mode transaction) refuse les requêtes préparées.
  const client = postgres(url, { max: 1, prepare: false, onnotice: () => {} });
  try {
    await migrate(drizzle(client), {
      migrationsFolder: fileURLToPath(new URL("../drizzle", import.meta.url)),
    });
    await client.unsafe(LOCKDOWN_SQL);
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
