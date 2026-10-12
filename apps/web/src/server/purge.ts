/** Effacement automatique des données dont la durée de conservation est dépassée. */
import type { Database } from "@culinova/db";
import { auditLogs, loginAttempts, sessions, verificationTokens } from "@culinova/db/schema";
import { lt } from "drizzle-orm";

/** Durées annoncées dans la politique de confidentialité. */
export const RETENTION = {
  auditLogsMonths: 12,
  loginAttemptsDays: 7,
} as const;

export async function purgeExpiredData(db: Database, now = new Date()) {
  const auditLimit = new Date(now);
  auditLimit.setMonth(auditLimit.getMonth() - RETENTION.auditLogsMonths);
  const attemptsLimit = new Date(now.getTime() - RETENTION.loginAttemptsDays * 86_400_000);

  const [audit, attempts, expiredSessions, tokens] = await Promise.all([
    db.delete(auditLogs).where(lt(auditLogs.at, auditLimit)).returning({ id: auditLogs.id }),
    db.delete(loginAttempts).where(lt(loginAttempts.at, attemptsLimit)).returning({ id: loginAttempts.id }),
    db.delete(sessions).where(lt(sessions.expiresAt, now)).returning({ id: sessions.id }),
    db
      .delete(verificationTokens)
      .where(lt(verificationTokens.expiresAt, now))
      .returning({ id: verificationTokens.id }),
  ]);
  return {
    auditLogs: audit.length,
    loginAttempts: attempts.length,
    sessions: expiredSessions.length,
    verificationTokens: tokens.length,
  };
}
