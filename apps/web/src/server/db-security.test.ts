/** Supabase : aucune table lisible ni modifiable par l'API publique (rôles anon et authenticated). */
import { LOCKDOWN_SQL } from "@culinova/db/migrate";
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { hasTestDb, testDb } from "@/test/db";

describe.skipIf(!hasTestDb)("verrouillage de l'API publique", () => {
  it("active la RLS partout et retire tous les droits aux rôles publics", async () => {
    const db = testDb();
    // Les rôles de Supabase n'existent pas sur un PostgreSQL ordinaire : on les crée pour le test.
    await db.execute(
      sql.raw(`
      do $$ begin
        if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
        if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
      end $$;
    `),
    );
    await db.execute(sql.raw("grant select on public.users to anon"));
    await db.execute(sql.raw(LOCKDOWN_SQL));

    const open = await db.execute<{ tablename: string }>(sql`
      select c.relname as tablename from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity`);
    expect(open.map((r) => r.tablename)).toEqual([]);

    const [rights] = await db.execute<{ anon: boolean; auth: boolean }>(sql`
      select has_table_privilege('anon', 'public.users', 'select') as anon,
             has_table_privilege('authenticated', 'public.recipes', 'select,insert,update,delete') as auth`);
    expect(rights).toEqual({ anon: false, auth: false });
  });
});
