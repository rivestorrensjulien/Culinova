/**
 * Demandes d'invitation déposées depuis la page d'accueil : enregistrement (limité
 * contre les abus), accusé de réception, alerte des administrateurs, puis décision
 * de l'administrateur (inviter = code personnel envoyé par e-mail, ou refuser).
 */
import type { Database } from "@culinova/db";
import {
  renderInvitationEmail,
  renderInvitationRequestAlertEmail,
  renderInvitationRequestReceivedEmail,
  sendEmail,
} from "@culinova/emails";
import { invitationRequests, invitations, users } from "@culinova/db/schema";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { DIRECT, type RequestSource, sourceDetail, sourceLabel } from "@/lib/request-source";
import { audit } from "../audit";
import { appUrl, localePrefix } from "../auth";
import { isAllowed, RATE_RULES, recordAttempt } from "../rate-limit";
import { createInvitation, normalizeEmail } from "./invitations";
import type { ActorContext } from "./users";

/** Profils proposés dans le formulaire (libellés dans les fichiers de traduction). */
export const REQUEST_PROFILES = ["chef", "caterer", "creator", "enthusiast", "other"] as const;
export type RequestProfile = (typeof REQUEST_PROFILES)[number];

const PROFILE_LABELS: Record<RequestProfile, string> = {
  chef: "Chef ou cuisinier professionnel",
  caterer: "Traiteur, restaurateur",
  creator: "Créateur de contenu culinaire",
  enthusiast: "Passionné de cuisine",
  other: "Autre",
};

export function profileLabel(profile: string | null): string | null {
  return profile && profile in PROFILE_LABELS ? PROFILE_LABELS[profile as RequestProfile] : null;
}

export type RequestStatus = "pending" | "invited" | "declined";

export interface NewInvitationRequest {
  name: string;
  email: string;
  profile: RequestProfile | null;
  message: string | null;
  locale: "fr" | "en";
  /** Provenance de la personne (réseau, canal, recette) ; accès direct par défaut. */
  origin?: RequestSource;
}

type SubmitRefused = { ok: false; reason: "rate_limited" };
export type SubmitRequestResult = { ok: true } | SubmitRefused;

/**
 * Enregistre une demande. La réponse est la même que l'adresse soit déjà inscrite,
 * déjà en attente ou nouvelle : rien ne permet de savoir qui utilise Culinova.
 */
export async function submitInvitationRequest(
  db: Database,
  input: NewInvitationRequest,
  meta: { ip: string | null; userAgent: string | null },
): Promise<SubmitRequestResult> {
  const email = normalizeEmail(input.email);
  const allowed = await isAllowed(db, "invitation_request", [
    { by: { ip: meta.ip ?? undefined }, rule: RATE_RULES.invitationRequestPerIp },
    { by: { email }, rule: RATE_RULES.invitationRequestPerEmail },
  ]);
  if (!allowed) return { ok: false, reason: "rate_limited" };
  await recordAttempt(db, { kind: "invitation_request", email, ip: meta.ip, success: true });

  const [existingUser] = await db
    .select({ id: users.id })
    .from(users)
    .where(sql`lower(${users.email}) = ${email}`);
  const [pending] = await db
    .select({ id: invitationRequests.id })
    .from(invitationRequests)
    .where(and(sql`lower(${invitationRequests.email}) = ${email}`, eq(invitationRequests.status, "pending")));
  if (existingUser || pending) return { ok: true };

  const [request] = await db
    .insert(invitationRequests)
    .values({
      name: input.name.trim().slice(0, 120),
      email,
      profile: input.profile,
      message: input.message?.trim().slice(0, 1000) || null,
      locale: input.locale,
      source: (input.origin ?? DIRECT).source,
      sourceMedium: input.origin?.medium ?? null,
      sourceCampaign: input.origin?.campaign ?? null,
      sourceRecipe: input.origin?.recipe ?? null,
      sourceReferrer: input.origin?.referrer ?? null,
      consentedAt: new Date(),
    })
    .returning();
  await audit(db, {
    actorId: null,
    action: "invitation_request.create",
    entity: "invitation_request",
    entityId: request!.id,
    ip: meta.ip,
    userAgent: meta.userAgent,
  });

  // Les e-mails ne doivent jamais faire échouer la demande, qui est déjà enregistrée.
  try {
    const received = await renderInvitationRequestReceivedEmail({
      name: request!.name,
      locale: input.locale,
    });
    await sendEmail({ to: email, ...received, tag: "invitation-request" });
  } catch (error) {
    console.error(
      `Accusé de réception non envoyé : ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  try {
    const admins = await db
      .select({ email: users.email })
      .from(users)
      .where(and(eq(users.role, "admin"), isNull(users.suspendedAt)));
    const alert = await renderInvitationRequestAlertEmail({
      name: request!.name,
      email,
      profile: profileLabel(request!.profile),
      message: request!.message,
      source: originText(request!),
      url: `${appUrl()}${localePrefix("fr")}/admin/demandes`,
    });
    for (const admin of admins) {
      await sendEmail({ to: admin.email, ...alert, tag: "invitation-request-alert" });
    }
  } catch (error) {
    console.error(
      `Alerte administrateur non envoyée : ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  return { ok: true };
}

/** « Instagram · message privé « RECETTE » · recette tostadas-argentines ». */
function originText(row: {
  source: string | null;
  sourceMedium: string | null;
  sourceCampaign: string | null;
  sourceRecipe: string | null;
}): string {
  const detail = sourceDetail({ medium: row.sourceMedium, campaign: row.sourceCampaign });
  return [sourceLabel(row.source), detail, row.sourceRecipe ? `recette ${row.sourceRecipe}` : null]
    .filter(Boolean)
    .join(" · ");
}

export interface RequestOriginView {
  source: string | null;
  label: string;
  detail: string | null;
  recipe: string | null;
  referrer: string | null;
}

export interface InvitationRequestView {
  id: string;
  name: string;
  email: string;
  profile: string | null;
  message: string | null;
  locale: string;
  status: RequestStatus;
  origin: RequestOriginView;
  createdAt: Date;
  decidedAt: Date | null;
}

export async function listInvitationRequests(
  db: Database,
  status?: RequestStatus,
): Promise<InvitationRequestView[]> {
  const rows = await db
    .select()
    .from(invitationRequests)
    .where(status ? eq(invitationRequests.status, status) : undefined)
    .orderBy(desc(invitationRequests.createdAt))
    .limit(500);
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    email: row.email,
    profile: profileLabel(row.profile),
    message: row.message,
    locale: row.locale,
    status: row.status,
    origin: {
      source: row.source,
      label: sourceLabel(row.source),
      detail: sourceDetail({ medium: row.sourceMedium, campaign: row.sourceCampaign }),
      recipe: row.sourceRecipe,
      referrer: row.sourceReferrer,
    },
    createdAt: row.createdAt,
    decidedAt: row.decidedAt,
  }));
}

export interface SourceStat {
  source: string | null;
  label: string;
  requests: number;
  invited: number;
}

export interface SourceStats {
  bySource: SourceStat[];
  /** Recettes publiques qui ont amené le plus de demandes. */
  byRecipe: Array<{ recipe: string; requests: number }>;
}

/** Provenance des demandes reçues (toutes, conservées 12 mois), de la plus fréquente à la plus rare. */
export async function requestSourceStats(db: Database): Promise<SourceStats> {
  const rows = await db
    .select({
      source: invitationRequests.source,
      requests: sql<number>`count(*)::int`,
      invited: sql<number>`count(*) filter (where ${invitationRequests.status} = 'invited')::int`,
    })
    .from(invitationRequests)
    .groupBy(invitationRequests.source);
  const recipes = await db
    .select({ recipe: invitationRequests.sourceRecipe, requests: sql<number>`count(*)::int` })
    .from(invitationRequests)
    .where(sql`${invitationRequests.sourceRecipe} is not null`)
    .groupBy(invitationRequests.sourceRecipe)
    .orderBy(sql`count(*) desc`)
    .limit(5);
  return {
    bySource: rows
      .map((row) => ({ ...row, label: sourceLabel(row.source) }))
      .sort((a, b) => b.requests - a.requests || a.label.localeCompare(b.label)),
    byRecipe: recipes.map((row) => ({ recipe: row.recipe!, requests: row.requests })),
  };
}

export async function pendingRequestCount(db: Database): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(invitationRequests)
    .where(eq(invitationRequests.status, "pending"));
  return row?.n ?? 0;
}

type DecisionRefused = { ok: false; reason: "not_found" | "already_decided" };
export type DecisionResult = { ok: true } | DecisionRefused;

/** Accepte une demande : code nominatif créé et envoyé dans la langue de la demande. */
export async function acceptInvitationRequest(
  db: Database,
  requestId: string,
  ctx: ActorContext,
  options: { expiresInDays?: number | null } = {},
): Promise<DecisionResult> {
  const [request] = await db.select().from(invitationRequests).where(eq(invitationRequests.id, requestId));
  if (!request) return { ok: false, reason: "not_found" };
  if (request.status !== "pending") return { ok: false, reason: "already_decided" };

  const expiresAt = options.expiresInDays ? new Date(Date.now() + options.expiresInDays * 86_400_000) : null;
  const { invitation, code } = await createInvitation(
    db,
    { label: request.name, email: request.email, expiresAt },
    ctx,
  );
  const locale = request.locale === "en" ? "en" : "fr";
  const url = `${appUrl()}${localePrefix(locale)}/invitation/${code}`;
  const rendered = await renderInvitationEmail({
    url,
    code,
    locale,
    expiresAt:
      expiresAt?.toLocaleDateString(locale === "en" ? "en-GB" : "fr-FR", {
        day: "numeric",
        month: "long",
        year: "numeric",
      }) ?? null,
  });
  await sendEmail({ to: request.email, ...rendered, tag: "invitation", url });
  await db.update(invitations).set({ sentAt: new Date() }).where(eq(invitations.id, invitation.id));
  await db
    .update(invitationRequests)
    .set({
      status: "invited",
      invitationId: invitation.id,
      decidedAt: new Date(),
      decidedBy: ctx.actorId,
      updatedAt: new Date(),
    })
    .where(eq(invitationRequests.id, requestId));
  await audit(db, {
    ...ctx,
    action: "invitation_request.accept",
    entity: "invitation_request",
    entityId: requestId,
    after: { invitationId: invitation.id },
  });
  return { ok: true };
}

/** Refuse une demande (aucun e-mail n'est envoyé). */
export async function declineInvitationRequest(
  db: Database,
  requestId: string,
  ctx: ActorContext,
): Promise<DecisionResult> {
  const [request] = await db
    .select({ status: invitationRequests.status })
    .from(invitationRequests)
    .where(eq(invitationRequests.id, requestId));
  if (!request) return { ok: false, reason: "not_found" };
  if (request.status !== "pending") return { ok: false, reason: "already_decided" };
  await db
    .update(invitationRequests)
    .set({ status: "declined", decidedAt: new Date(), decidedBy: ctx.actorId, updatedAt: new Date() })
    .where(eq(invitationRequests.id, requestId));
  await audit(db, {
    ...ctx,
    action: "invitation_request.decline",
    entity: "invitation_request",
    entityId: requestId,
  });
  return { ok: true };
}
