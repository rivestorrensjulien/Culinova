/**
 * Suspension et réactivation des comptes.
 * Suspendre = compte bloqué + toutes les sessions fermées ; les données sont conservées.
 */
import type { Database } from "@culinova/db";
import { sessions, users } from "@culinova/db/schema";
import { eq } from "drizzle-orm";
import { audit } from "../audit";

type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];
type Executor = Database | Tx;

export interface ActorContext {
  actorId: string | null;
  ip?: string | null;
  userAgent?: string | null;
}

/** Ferme toutes les sessions d'une personne (déconnexion sur tous ses appareils). */
export async function revokeAllSessions(db: Executor, userId: string, ctx: ActorContext): Promise<number> {
  const closed = await db.delete(sessions).where(eq(sessions.userId, userId)).returning({ id: sessions.id });
  await audit(db, {
    ...ctx,
    action: "user.sessions.revoke",
    entity: "user",
    entityId: userId,
    after: { closed: closed.length },
  });
  return closed.length;
}

export async function suspendUser(
  db: Executor,
  userId: string,
  reason: "invitation_revoked" | "manual",
  ctx: ActorContext,
): Promise<void> {
  const [before] = await db
    .update(users)
    .set({ banned: true, banReason: reason, suspendedAt: new Date() })
    .where(eq(users.id, userId))
    .returning({ id: users.id });
  if (!before) throw new Error("Utilisateur introuvable");
  await audit(db, { ...ctx, action: "user.suspend", entity: "user", entityId: userId, after: { reason } });
  await revokeAllSessions(db, userId, ctx);
}

export async function reactivateUser(db: Executor, userId: string, ctx: ActorContext): Promise<void> {
  const [row] = await db
    .update(users)
    .set({ banned: false, banReason: null, banExpires: null, suspendedAt: null })
    .where(eq(users.id, userId))
    .returning({ id: users.id });
  if (!row) throw new Error("Utilisateur introuvable");
  await audit(db, { ...ctx, action: "user.reactivate", entity: "user", entityId: userId });
}
