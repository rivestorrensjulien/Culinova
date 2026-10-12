/** Documents juridiques en vigueur, identité de l'éditeur et acceptation des nouvelles versions. */
import type { Database } from "@culinova/db";
import { consentRecords, legalDocuments, SETTING_KEYS, siteSettings } from "@culinova/db/schema";
import { and, eq, inArray } from "drizzle-orm";
import { type LegalIdentity, parseLegalIdentity, pendingDocuments } from "@/lib/legal";
import type { ActorContext } from "./access/users";
import { REQUIRED_SIGNUP_DOCUMENTS } from "./access/invitations";
import { audit } from "./audit";

export async function getLegalIdentity(db: Database): Promise<LegalIdentity> {
  const [row] = await db
    .select({ value: siteSettings.value })
    .from(siteSettings)
    .where(eq(siteSettings.key, SETTING_KEYS.legalIdentity));
  return parseLegalIdentity(row?.value);
}

export async function saveLegalIdentity(
  db: Database,
  identity: LegalIdentity,
  ctx: ActorContext,
): Promise<void> {
  const before = await getLegalIdentity(db);
  await db
    .insert(siteSettings)
    .values({ key: SETTING_KEYS.legalIdentity, value: identity })
    .onConflictDoUpdate({ target: siteSettings.key, set: { value: identity, updatedAt: new Date() } });
  await audit(db, {
    ...ctx,
    action: "settings.legal_identity.update",
    entity: "site_settings",
    before,
    after: identity,
  });
}

export interface PendingDocument {
  id: string;
  type: string;
  version: string;
  title: string;
}

/** CGU et politique de confidentialité mises à jour depuis la dernière acceptation. */
export async function pendingConsents(db: Database, userId: string): Promise<PendingDocument[]> {
  const current = await db
    .select({
      id: legalDocuments.id,
      type: legalDocuments.type,
      version: legalDocuments.version,
      title: legalDocuments.title,
      locale: legalDocuments.locale,
    })
    .from(legalDocuments)
    .where(
      and(eq(legalDocuments.isCurrent, true), inArray(legalDocuments.type, [...REQUIRED_SIGNUP_DOCUMENTS])),
    );
  // Une seule version par type : le français fait foi.
  const docs = current.filter((d) => d.locale === "fr");
  if (docs.length === 0) return [];
  const consents = await db
    .select({ legalDocumentId: consentRecords.legalDocumentId, type: consentRecords.consentType })
    .from(consentRecords)
    .where(and(eq(consentRecords.userId, userId), eq(consentRecords.granted, true)));
  return pendingDocuments(docs, consents).map(({ id, type, version, title }) => ({
    id,
    type,
    version,
    title,
  }));
}

/** Enregistre l'acceptation des nouvelles versions (preuve horodatée). */
export async function acceptDocuments(
  db: Database,
  userId: string,
  documentIds: string[],
  meta: { ip: string | null; userAgent: string | null },
): Promise<number> {
  const pending = await pendingConsents(db, userId);
  const accepted = pending.filter((d) => documentIds.includes(d.id));
  if (accepted.length === 0) return 0;
  await db.insert(consentRecords).values(
    accepted.map((doc) => ({
      userId,
      legalDocumentId: doc.id,
      consentType: doc.type,
      granted: true,
      context: "update" as const,
      ip: meta.ip,
      userAgent: meta.userAgent,
    })),
  );
  await audit(db, {
    actorId: userId,
    action: "legal.consent.update",
    entity: "user",
    entityId: userId,
    after: accepted.map((d) => `${d.type}@${d.version}`),
    ip: meta.ip,
    userAgent: meta.userAgent,
  });
  return accepted.length;
}
