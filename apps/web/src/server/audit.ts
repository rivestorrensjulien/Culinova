import type { Database } from "@culinova/db";
import { auditLogs } from "@culinova/db/schema";

export interface AuditEntry {
  actorId?: string | null;
  impersonatorId?: string | null;
  /** Ex. « invitation.revoke », « user.suspend », « auth.login ». */
  action: string;
  entity: string;
  entityId?: string | null;
  before?: unknown;
  after?: unknown;
  ip?: string | null;
  userAgent?: string | null;
}

type Executor = Pick<Database, "insert">;

/** Ajoute une ligne au journal d'audit (jamais modifié ni supprimé). */
export async function audit(db: Executor, entry: AuditEntry): Promise<void> {
  await db.insert(auditLogs).values({
    actorId: entry.actorId ?? null,
    impersonatorId: entry.impersonatorId ?? null,
    action: entry.action,
    entity: entry.entity,
    entityId: entry.entityId ?? null,
    before: entry.before ?? null,
    after: entry.after ?? null,
    ip: entry.ip ?? null,
    userAgent: entry.userAgent ?? null,
  });
}
