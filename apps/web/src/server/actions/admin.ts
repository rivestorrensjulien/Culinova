"use server";

import { renderInvitationEmail, sendEmail } from "@culinova/emails";
import { impersonationSessions, invitations, users } from "@culinova/db/schema";
import { and, eq, isNotNull, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { getLocale } from "next-intl/server";
import { z } from "zod";
import { readQuotaForm, overridesFrom, readUsdToMicros } from "@/lib/admin-forms";
import { redirect } from "@/i18n/navigation";
import { createInvitation, restoreInvitation, revokeInvitation } from "../access/invitations";
import { acceptInvitationRequest, declineInvitationRequest } from "../access/requests";
import { type ActorContext, reactivateUser, revokeAllSessions, suspendUser } from "../access/users";
import { audit } from "../audit";
import { appUrl, localePrefix } from "../auth";
import { getDb } from "../db";
import { requestMeta } from "../request";
import { LEGAL_IDENTITY_FIELDS, parseLegalIdentity } from "@/lib/legal";
import { saveAiBudgetCap, saveDefaultQuotas, saveUserQuotaOverrides } from "../admin-settings";
import { saveLegalIdentity } from "../legal";
import { getAuth, getCurrentSession, requireAdmin } from "../session";

async function adminContext(): Promise<ActorContext> {
  const session = await requireAdmin(await getLocale());
  const { ip, userAgent } = await requestMeta();
  return { actorId: session.user.id, ip, userAgent };
}

const idSchema = z.uuid();

function idFrom(formData: FormData): string {
  return idSchema.parse(formData.get("id"));
}

// ─── Invitations ────────────────────────────────────────────────────────────

export type CreateInvitationState =
  | { status: "idle" }
  | { status: "created"; code: string; url: string; emailed: boolean; email: string | null }
  | { status: "error"; message: string };

const createSchema = z.object({
  label: z.string().trim().max(120).optional(),
  email: z.union([z.literal(""), z.email().max(254)]).optional(),
  expiresInDays: z.union([z.literal(""), z.coerce.number().int().min(1).max(365)]).optional(),
  send: z.literal("on").optional(),
});

export async function createInvitationAction(
  _prev: CreateInvitationState,
  formData: FormData,
): Promise<CreateInvitationState> {
  const ctx = await adminContext();
  const parsed = createSchema.safeParse({
    label: formData.get("label") ?? undefined,
    email: formData.get("email") ?? undefined,
    expiresInDays: formData.get("expiresInDays") ?? undefined,
    send: formData.get("send") ?? undefined,
  });
  if (!parsed.success)
    return { status: "error", message: "Vérifiez l'adresse e-mail et la durée de validité." };
  const { label, email, expiresInDays, send } = parsed.data;
  if (send && !email)
    return { status: "error", message: "Indiquez une adresse e-mail pour envoyer l'invitation." };

  const db = getDb();
  const expiresAt =
    typeof expiresInDays === "number" ? new Date(Date.now() + expiresInDays * 86_400_000) : null;
  const { invitation, code } = await createInvitation(db, { label, email: email || null, expiresAt }, ctx);
  const url = `${appUrl()}${localePrefix("fr")}/invitation/${code}`;

  let emailed = false;
  if (send && email) {
    const rendered = await renderInvitationEmail({
      url,
      code,
      expiresAt:
        expiresAt?.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" }) ?? null,
    });
    await sendEmail({ to: email, ...rendered, tag: "invitation", url });
    await db.update(invitations).set({ sentAt: new Date() }).where(eq(invitations.id, invitation.id));
    await audit(db, {
      ...ctx,
      action: "invitation.send",
      entity: "invitation",
      entityId: invitation.id,
      after: { email },
    });
    emailed = true;
  }
  revalidatePath("/admin/invitations");
  return { status: "created", code, url, emailed, email: email || null };
}

export async function revokeInvitationAction(formData: FormData): Promise<void> {
  const ctx = await adminContext();
  await revokeInvitation(getDb(), idFrom(formData), ctx);
  revalidatePath("/admin", "layout");
}

export async function restoreInvitationAction(formData: FormData): Promise<void> {
  const ctx = await adminContext();
  await restoreInvitation(getDb(), idFrom(formData), ctx);
  revalidatePath("/admin", "layout");
}

// ─── Demandes d'invitation ──────────────────────────────────────────────────

const expiresSchema = z.union([z.literal(""), z.coerce.number().int().min(1).max(365)]);

/** Inviter : code nominatif créé et envoyé par e-mail à la personne. */
export async function acceptRequestAction(formData: FormData): Promise<void> {
  const ctx = await adminContext();
  const days = expiresSchema.safeParse(formData.get("expiresInDays") ?? "");
  await acceptInvitationRequest(getDb(), idFrom(formData), ctx, {
    expiresInDays: days.success && typeof days.data === "number" ? days.data : null,
  });
  revalidatePath("/admin", "layout");
}

export async function declineRequestAction(formData: FormData): Promise<void> {
  const ctx = await adminContext();
  await declineInvitationRequest(getDb(), idFrom(formData), ctx);
  revalidatePath("/admin", "layout");
}

// ─── Utilisateurs ───────────────────────────────────────────────────────────

export async function suspendUserAction(formData: FormData): Promise<void> {
  const ctx = await adminContext();
  const userId = idFrom(formData);
  if (userId === ctx.actorId) throw new Error("Vous ne pouvez pas suspendre votre propre compte.");
  await getDb().transaction((tx) => suspendUser(tx, userId, "manual", ctx));
  revalidatePath("/admin", "layout");
}

export async function reactivateUserAction(formData: FormData): Promise<void> {
  const ctx = await adminContext();
  const userId = idFrom(formData);
  const db = getDb();
  // Si le compte avait été suspendu par la révocation de son code, on rétablit aussi le code.
  const [revoked] = await db
    .select({ id: invitations.id })
    .from(invitations)
    .where(and(eq(invitations.redeemedBy, userId), isNotNull(invitations.revokedAt)));
  if (revoked) await restoreInvitation(db, revoked.id, ctx);
  else await reactivateUser(db, userId, ctx);
  revalidatePath("/admin", "layout");
}

export async function revokeUserSessionsAction(formData: FormData): Promise<void> {
  const ctx = await adminContext();
  await revokeAllSessions(getDb(), idFrom(formData), ctx);
  revalidatePath("/admin", "layout");
}

export async function resendMagicLinkAction(formData: FormData): Promise<void> {
  const ctx = await adminContext();
  const userId = idFrom(formData);
  const db = getDb();
  const [user] = await db
    .select({ email: users.email, locale: users.locale, banned: users.banned })
    .from(users)
    .where(eq(users.id, userId));
  if (!user || user.banned) throw new Error("Impossible d'envoyer un lien à un compte suspendu.");
  const prefix = localePrefix(user.locale);
  await getAuth().api.signInMagicLink({
    body: {
      email: user.email,
      callbackURL: `${prefix}/app`,
      errorCallbackURL: `${prefix}/connexion?raison=lien`,
      metadata: { locale: user.locale },
    },
    headers: await headers(),
  });
  await audit(db, { ...ctx, action: "user.magic_link.resend", entity: "user", entityId: userId });
  revalidatePath("/admin/journal");
}

// ─── Quotas et budget IA ────────────────────────────────────────────────────

type AdminFormResult = { status: "saved"; message: string } | { status: "error"; message: string };
export type AdminFormState = { status: "idle" } | AdminFormResult;

const QUOTA_LABELS = {
  recipes: "recettes par mois",
  images: "images par mois",
  regenerations: "régénérations par recette",
} as const;

export async function saveDefaultQuotasAction(
  _prev: AdminFormState,
  formData: FormData,
): Promise<AdminFormState> {
  const ctx = await adminContext();
  const read = readQuotaForm(formData);
  if (!read.ok) return { status: "error", message: `Valeur invalide : ${QUOTA_LABELS[read.field]}.` };
  await saveDefaultQuotas(getDb(), read.value, ctx);
  revalidatePath("/admin", "layout");
  return { status: "saved", message: "Quotas par défaut enregistrés." };
}

export async function saveAiBudgetAction(_prev: AdminFormState, formData: FormData): Promise<AdminFormState> {
  const ctx = await adminContext();
  const read = readUsdToMicros(formData.get("cap"));
  if (!read.ok)
    return { status: "error", message: "Indiquez un montant en dollars, par exemple 50 ou 12,50." };
  await saveAiBudgetCap(getDb(), read.value, ctx);
  revalidatePath("/admin", "layout");
  return { status: "saved", message: "Plafond de budget IA enregistré." };
}

export async function saveUserQuotasAction(
  _prev: AdminFormState,
  formData: FormData,
): Promise<AdminFormState> {
  const ctx = await adminContext();
  const userId = idFrom(formData);
  const read = readQuotaForm(formData);
  if (!read.ok) return { status: "error", message: `Valeur invalide : ${QUOTA_LABELS[read.field]}.` };
  await saveUserQuotaOverrides(getDb(), userId, overridesFrom(read.value), ctx);
  revalidatePath("/admin", "layout");
  return { status: "saved", message: "Quotas de la personne enregistrés." };
}

/** Identité de l'éditeur reprise dans les mentions légales et la politique de confidentialité. */
export async function saveLegalIdentityAction(
  _prev: AdminFormState,
  formData: FormData,
): Promise<AdminFormState> {
  const ctx = await adminContext();
  const raw = Object.fromEntries(LEGAL_IDENTITY_FIELDS.map((f) => [f.key, formData.get(f.key)]));
  await saveLegalIdentity(getDb(), parseLegalIdentity(raw), ctx);
  revalidatePath("/", "layout");
  return {
    status: "saved",
    message: "Informations légales enregistrées : les pages juridiques sont à jour.",
  };
}

// ─── Se connecter en tant que ───────────────────────────────────────────────

/** Ouvre une session au nom de la personne (1 h au plus), tracée dans le journal d'audit. */
export async function impersonateUserAction(formData: FormData): Promise<void> {
  const ctx = await adminContext();
  const userId = idFrom(formData);
  if (userId === ctx.actorId) throw new Error("Vous êtes déjà connecté·e à votre propre compte.");
  const db = getDb();
  const [user] = await db
    .select({ role: users.role, banned: users.banned })
    .from(users)
    .where(eq(users.id, userId));
  if (!user || user.banned || user.role === "admin") {
    throw new Error("Impossible de se connecter en tant que cette personne.");
  }
  await getAuth().api.impersonateUser({ body: { userId }, headers: await headers() });
  await db.insert(impersonationSessions).values({ adminId: ctx.actorId!, userId });
  await audit(db, {
    ...ctx,
    impersonatorId: ctx.actorId,
    action: "user.impersonate.start",
    entity: "user",
    entityId: userId,
  });
  return redirect({ href: "/app", locale: await getLocale() });
}

/** Termine la session « en tant que » et revient à l'administration. */
export async function stopImpersonatingAction(): Promise<void> {
  const locale = await getLocale();
  const session = await getCurrentSession();
  if (!session?.impersonatedBy) return redirect({ href: "/app", locale });
  const { ip, userAgent } = await requestMeta();
  const db = getDb();
  await db
    .update(impersonationSessions)
    .set({ endedAt: new Date() })
    .where(
      and(
        eq(impersonationSessions.adminId, session.impersonatedBy),
        eq(impersonationSessions.userId, session.user.id),
        isNull(impersonationSessions.endedAt),
      ),
    );
  await audit(db, {
    actorId: session.impersonatedBy,
    impersonatorId: session.impersonatedBy,
    action: "user.impersonate.stop",
    entity: "user",
    entityId: session.user.id,
    ip,
    userAgent,
  });
  await getAuth().api.stopImpersonating({ headers: await headers() });
  return redirect({ href: "/admin/utilisateurs", locale });
}
