"use server";

import { renderInvitationEmail, sendEmail } from "@culinova/emails";
import { invitations, users } from "@culinova/db/schema";
import { and, eq, isNotNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { getLocale } from "next-intl/server";
import { z } from "zod";
import { createInvitation, restoreInvitation, revokeInvitation } from "../access/invitations";
import { type ActorContext, reactivateUser, revokeAllSessions, suspendUser } from "../access/users";
import { audit } from "../audit";
import { appUrl, localePrefix } from "../auth";
import { getDb } from "../db";
import { requestMeta } from "../request";
import { getAuth, requireAdmin } from "../session";

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
