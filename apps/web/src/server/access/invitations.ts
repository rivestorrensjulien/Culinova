/** Cycle de vie des invitations : création, réservation, utilisation, révocation. */
import type { Database } from "@culinova/db";
import { invitations, legalDocuments, users } from "@culinova/db/schema";
import { and, eq, gt, inArray, isNull, or, sql } from "drizzle-orm";
import { audit } from "../audit";
import {
  generateInvitationCode,
  hashInvitationCode,
  invitationCodeHint,
  normalizeInvitationCode,
} from "./codes";
import { type ActorContext, reactivateUser, suspendUser } from "./users";

/** Durée de validité d'une réservation (le temps de cliquer sur le lien magique, avec marge). */
export const RESERVATION_TTL_MS = 30 * 60 * 1000;

export const REQUIRED_SIGNUP_DOCUMENTS = ["cgu", "privacy"] as const;

export type InvitationRow = typeof invitations.$inferSelect;

export type InvitationProblem = "invalid" | "revoked" | "used" | "expired" | "wrong_email";

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export async function createInvitation(
  db: Database,
  input: { label?: string | null; email?: string | null; expiresAt?: Date | null },
  ctx: ActorContext,
): Promise<{ invitation: InvitationRow; code: string }> {
  // Collision quasi impossible, mais on réessaie par sécurité.
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = generateInvitationCode();
    const [invitation] = await db
      .insert(invitations)
      .values({
        codeHash: hashInvitationCode(code),
        codeHint: invitationCodeHint(code),
        label: input.label?.trim() || null,
        email: input.email ? normalizeEmail(input.email) : null,
        expiresAt: input.expiresAt ?? null,
        createdBy: ctx.actorId,
      })
      .onConflictDoNothing({ target: invitations.codeHash })
      .returning();
    if (invitation) {
      await audit(db, {
        ...ctx,
        action: "invitation.create",
        entity: "invitation",
        entityId: invitation.id,
        after: { label: invitation.label, email: invitation.email, expiresAt: invitation.expiresAt },
      });
      return { invitation, code };
    }
  }
  throw new Error("Impossible de générer un code unique");
}

/** Retrouve une invitation à partir du code saisi. */
export async function findInvitationByCode(db: Database, rawCode: string): Promise<InvitationRow | null> {
  const code = normalizeInvitationCode(rawCode);
  if (!code) return null;
  const [row] = await db
    .select()
    .from(invitations)
    .where(eq(invitations.codeHash, hashInvitationCode(code)));
  return row ?? null;
}

/** Problème empêchant d'utiliser l'invitation (ou null si elle est utilisable). */
export function invitationProblem(
  invitation: InvitationRow | null,
  email?: string,
  now = new Date(),
): InvitationProblem | null {
  if (!invitation) return "invalid";
  if (invitation.revokedAt) return "revoked";
  if (invitation.redeemedBy || invitation.redeemedAt) return "used";
  if (invitation.expiresAt && invitation.expiresAt <= now) return "expired";
  if (email && invitation.email && invitation.email !== normalizeEmail(email)) return "wrong_email";
  return null;
}

/** Documents juridiques en vigueur à accepter lors de l'inscription. */
export async function currentSignupDocuments(db: Database, locale = "fr") {
  const docs = await db
    .select({
      id: legalDocuments.id,
      type: legalDocuments.type,
      version: legalDocuments.version,
      locale: legalDocuments.locale,
    })
    .from(legalDocuments)
    .where(
      and(eq(legalDocuments.isCurrent, true), inArray(legalDocuments.type, [...REQUIRED_SIGNUP_DOCUMENTS])),
    );
  // Version dans la langue demandée si elle existe, sinon en français.
  return REQUIRED_SIGNUP_DOCUMENTS.map(
    (type) => docs.find((d) => d.type === type && d.locale === locale) ?? docs.find((d) => d.type === type),
  ).filter((d): d is NonNullable<typeof d> => Boolean(d));
}

/**
 * Réserve l'invitation pour une adresse, le temps que la personne clique sur
 * son lien magique. Le code n'est « consommé » qu'à la création du compte.
 */
export async function reserveInvitation(
  db: Database,
  invitationId: string,
  input: {
    email: string;
    name: string;
    documentIds: string[];
    locale: string;
    ip: string | null;
    userAgent: string | null;
  },
): Promise<boolean> {
  const rows = await db
    .update(invitations)
    .set({
      reservedEmail: normalizeEmail(input.email),
      reservedName: input.name.trim() || null,
      reservedAt: new Date(),
      reservedConsents: {
        documentIds: input.documentIds,
        locale: input.locale,
        ip: input.ip,
        userAgent: input.userAgent,
      },
    })
    .where(
      and(
        eq(invitations.id, invitationId),
        isNull(invitations.redeemedBy),
        isNull(invitations.revokedAt),
        or(isNull(invitations.expiresAt), gt(invitations.expiresAt, new Date())),
      ),
    )
    .returning({ id: invitations.id });
  return rows.length === 1;
}

/** Réservation valide pour cette adresse (appelée juste avant la création du compte). */
export async function findReservationForEmail(db: Database, email: string): Promise<InvitationRow | null> {
  const [row] = await db
    .select()
    .from(invitations)
    .where(
      and(
        sql`lower(${invitations.reservedEmail}) = ${normalizeEmail(email)}`,
        isNull(invitations.redeemedBy),
        isNull(invitations.revokedAt),
        or(isNull(invitations.expiresAt), gt(invitations.expiresAt, new Date())),
        gt(invitations.reservedAt, new Date(Date.now() - RESERVATION_TTL_MS)),
      ),
    )
    .orderBy(sql`${invitations.reservedAt} desc`)
    .limit(1);
  return row ?? null;
}

/** Lie l'invitation au compte qui vient d'être créé. */
export async function redeemReservation(
  db: Database,
  userId: string,
  email: string,
): Promise<InvitationRow | null> {
  const reservation = await findReservationForEmail(db, email);
  if (!reservation) return null;
  const [redeemed] = await db
    .update(invitations)
    .set({ redeemedBy: userId, redeemedAt: new Date(), reservedAt: null })
    .where(and(eq(invitations.id, reservation.id), isNull(invitations.redeemedBy)))
    .returning();
  if (!redeemed) return null;
  if (redeemed.quotaOverrides) {
    await db.update(users).set({ quotaOverrides: redeemed.quotaOverrides }).where(eq(users.id, userId));
  }
  return redeemed;
}

/** Révoque un code. S'il a déjà servi, le compte associé est suspendu et déconnecté partout. */
export async function revokeInvitation(db: Database, invitationId: string, ctx: ActorContext): Promise<void> {
  await db.transaction(async (tx) => {
    const [row] = await tx
      .update(invitations)
      .set({ revokedAt: new Date(), revokedBy: ctx.actorId, reservedEmail: null, reservedAt: null })
      .where(and(eq(invitations.id, invitationId), isNull(invitations.revokedAt)))
      .returning();
    if (!row) return;
    await audit(tx, { ...ctx, action: "invitation.revoke", entity: "invitation", entityId: invitationId });
    if (row.redeemedBy) await suspendUser(tx, row.redeemedBy, "invitation_revoked", ctx);
  });
}

/** Annule la révocation : le code redevient valide et le compte associé est réactivé. */
export async function restoreInvitation(
  db: Database,
  invitationId: string,
  ctx: ActorContext,
): Promise<void> {
  await db.transaction(async (tx) => {
    const [row] = await tx
      .update(invitations)
      .set({ revokedAt: null, revokedBy: null })
      .where(eq(invitations.id, invitationId))
      .returning();
    if (!row) return;
    await audit(tx, { ...ctx, action: "invitation.restore", entity: "invitation", entityId: invitationId });
    if (row.redeemedBy) await reactivateUser(tx, row.redeemedBy, ctx);
  });
}
