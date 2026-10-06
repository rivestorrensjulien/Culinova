import { createDb, type Database } from "@culinova/db";
import { users } from "@culinova/db/schema";
import { randomUUID } from "node:crypto";
import { testDatabaseUrl } from "./env";

export const hasTestDb = Boolean(testDatabaseUrl());

let db: Database | undefined;

export function testDb(): Database {
  db ??= createDb(testDatabaseUrl());
  return db;
}

export function uniqueEmail(prefix = "test"): string {
  return `${prefix}-${randomUUID().slice(0, 8)}@exemple.test`;
}

export async function createTestUser(input: { role?: "user" | "admin"; email?: string } = {}) {
  const [user] = await testDb()
    .insert(users)
    .values({ email: input.email ?? uniqueEmail(), role: input.role ?? "user", emailVerified: true })
    .returning();
  return user!;
}
