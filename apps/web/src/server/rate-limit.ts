/**
 * Limitation des tentatives (demandes de lien, codes d'invitation), stockée en base
 * dans login_attempts : fonctionne sans service externe, y compris sur Vercel.
 */
import type { Database } from "@culinova/db";
import { loginAttempts } from "@culinova/db/schema";
import { and, eq, gt, sql } from "drizzle-orm";

type AttemptKind = "magic_link" | "invitation";

export interface RateRule {
  /** Nombre maximal de tentatives dans la fenêtre. */
  max: number;
  windowSeconds: number;
  /** Ne compter que les échecs (ex. codes d'invitation erronés). */
  failuresOnly?: boolean;
}

export const RATE_RULES = {
  magicLinkPerEmail: { max: 5, windowSeconds: 15 * 60 },
  magicLinkPerIp: { max: 30, windowSeconds: 60 * 60 },
  invitationFailuresPerIp: { max: 10, windowSeconds: 60 * 60, failuresOnly: true },
} satisfies Record<string, RateRule>;

async function countAttempts(
  db: Database,
  kind: AttemptKind,
  by: { email?: string; ip?: string },
  rule: RateRule,
): Promise<number> {
  const since = new Date(Date.now() - rule.windowSeconds * 1000);
  const conditions = [eq(loginAttempts.kind, kind), gt(loginAttempts.at, since)];
  if (by.email !== undefined) conditions.push(eq(loginAttempts.email, by.email));
  if (by.ip !== undefined) conditions.push(eq(loginAttempts.ip, by.ip));
  if (rule.failuresOnly) conditions.push(eq(loginAttempts.success, false));
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(loginAttempts)
    .where(and(...conditions));
  return row?.n ?? 0;
}

/** Vérifie qu'une nouvelle tentative respecte toutes les règles données. */
export async function isAllowed(
  db: Database,
  kind: AttemptKind,
  checks: Array<{ by: { email?: string; ip?: string }; rule: RateRule }>,
): Promise<boolean> {
  for (const { by, rule } of checks) {
    if (Object.values(by).some((v) => v === undefined || v === "")) continue;
    if ((await countAttempts(db, kind, by, rule)) >= rule.max) return false;
  }
  return true;
}

export async function recordAttempt(
  db: Database,
  attempt: {
    kind: AttemptKind;
    email?: string | null;
    ip?: string | null;
    userId?: string | null;
    success: boolean;
  },
): Promise<void> {
  await db.insert(loginAttempts).values({
    kind: attempt.kind,
    email: attempt.email ?? null,
    ip: attempt.ip ?? null,
    userId: attempt.userId ?? null,
    success: attempt.success,
  });
}
