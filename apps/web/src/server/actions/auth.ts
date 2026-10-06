"use server";

import { users } from "@culinova/db/schema";
import { sql } from "drizzle-orm";
import { headers } from "next/headers";
import { getLocale } from "next-intl/server";
import { z } from "zod";
import { redirect } from "@/i18n/navigation";
import {
  currentSignupDocuments,
  findInvitationByCode,
  invitationProblem,
  type InvitationProblem,
  normalizeEmail,
  reserveInvitation,
} from "../access/invitations";
import { revokeAllSessions } from "../access/users";
import { audit } from "../audit";
import { localePrefix } from "../auth";
import { getDb } from "../db";
import { isAllowed, RATE_RULES, recordAttempt } from "../rate-limit";
import { requestMeta } from "../request";
import { getAuth, getCurrentSession, requireUser } from "../session";
import { verifyAndMarkSession } from "../two-factor";

const emailSchema = z.email().max(254);

async function findUserByEmail(email: string) {
  const [user] = await getDb()
    .select({ id: users.id, banned: users.banned })
    .from(users)
    .where(sql`lower(${users.email}) = ${email}`);
  return user ?? null;
}

// ─── Connexion par lien magique ─────────────────────────────────────────────

export type SignInState =
  | { status: "idle" }
  | { status: "sent"; email: string }
  | { status: "error"; error: "email" | "rate" | "server" };

export async function signInAction(_prev: SignInState, formData: FormData): Promise<SignInState> {
  const locale = await getLocale();
  const parsed = emailSchema.safeParse(String(formData.get("email") ?? "").trim());
  if (!parsed.success) return { status: "error", error: "email" };
  const email = normalizeEmail(parsed.data);
  const db = getDb();
  const { ip } = await requestMeta();

  const allowed = await isAllowed(db, "magic_link", [
    { by: { email }, rule: RATE_RULES.magicLinkPerEmail },
    { by: { ip: ip ?? undefined }, rule: RATE_RULES.magicLinkPerIp },
  ]);
  if (!allowed) return { status: "error", error: "rate" };

  const user = await findUserByEmail(email);
  await recordAttempt(db, {
    kind: "magic_link",
    email,
    ip,
    userId: user?.id,
    success: Boolean(user && !user.banned),
  });
  // Un compte suspendu ne reçoit plus de lien.
  if (user?.banned) return redirect({ href: "/acces-suspendu", locale });

  if (user) {
    const prefix = localePrefix(locale);
    try {
      await getAuth().api.signInMagicLink({
        body: {
          email,
          callbackURL: `${prefix}/app`,
          errorCallbackURL: `${prefix}/connexion?raison=lien`,
          metadata: { locale },
        },
        headers: await headers(),
      });
    } catch (error) {
      console.error("Envoi du lien magique impossible", error);
      return { status: "error", error: "server" };
    }
  }
  // Même réponse que le compte existe ou non (on ne révèle pas qui est inscrit).
  return { status: "sent", email };
}

// ─── Inscription avec une invitation ────────────────────────────────────────

export type InvitationState =
  | { status: "idle" }
  | { status: "sent"; email: string }
  | {
      status: "error";
      error: InvitationProblem | "email" | "consent" | "account_exists" | "rate" | "server";
    };

export async function acceptInvitationAction(
  code: string,
  _prev: InvitationState,
  formData: FormData,
): Promise<InvitationState> {
  const locale = await getLocale();
  const db = getDb();
  const { ip, userAgent } = await requestMeta();

  const ipRule = [{ by: { ip: ip ?? undefined }, rule: RATE_RULES.invitationFailuresPerIp }];
  if (!(await isAllowed(db, "invitation", ipRule))) return { status: "error", error: "rate" };

  const parsed = emailSchema.safeParse(String(formData.get("email") ?? "").trim());
  if (!parsed.success) return { status: "error", error: "email" };
  const email = normalizeEmail(parsed.data);
  const name = String(formData.get("name") ?? "")
    .trim()
    .slice(0, 120);

  const invitation = await findInvitationByCode(db, code);
  const problem = invitationProblem(invitation, email);
  if (problem || !invitation) {
    await recordAttempt(db, { kind: "invitation", email, ip, success: false });
    return { status: "error", error: problem ?? "invalid" };
  }
  if (formData.get("cgu") !== "on" || formData.get("privacy") !== "on") {
    return { status: "error", error: "consent" };
  }
  if (await findUserByEmail(email)) return { status: "error", error: "account_exists" };

  const documents = await currentSignupDocuments(db, locale);
  const reserved = await reserveInvitation(db, invitation.id, {
    email,
    name,
    documentIds: documents.map((d) => d.id),
    locale,
    ip,
    userAgent,
  });
  if (!reserved) return { status: "error", error: "used" };
  await audit(db, {
    action: "invitation.reserve",
    entity: "invitation",
    entityId: invitation.id,
    after: { email },
    ip,
    userAgent,
  });

  const prefix = localePrefix(locale);
  try {
    await getAuth().api.signInMagicLink({
      body: {
        email,
        name,
        callbackURL: `${prefix}/app?bienvenue=1`,
        newUserCallbackURL: `${prefix}/app?bienvenue=1`,
        errorCallbackURL: `${prefix}/connexion?raison=invitation`,
        metadata: { locale },
      },
      headers: await headers(),
    });
  } catch (error) {
    console.error("Envoi du lien d'activation impossible", error);
    return { status: "error", error: "server" };
  }
  await recordAttempt(db, { kind: "invitation", email, ip, success: true });
  return { status: "sent", email };
}

// ─── Second facteur des administrateurs ─────────────────────────────────────

export type TwoFactorState =
  | { status: "idle" }
  | { status: "backup"; codes: string[] }
  | { status: "error"; error: "invalid" | "locked" | "not_enrolled" };

export async function verifyTwoFactorAction(
  _prev: TwoFactorState,
  formData: FormData,
): Promise<TwoFactorState> {
  const locale = await getLocale();
  const session = await requireUser(locale);
  if (session.user.role !== "admin") return redirect({ href: "/app", locale });
  const { ip, userAgent } = await requestMeta();
  const result = await verifyAndMarkSession(getDb(), {
    userId: session.user.id,
    email: session.user.email,
    sessionId: session.sessionId,
    code: String(formData.get("code") ?? ""),
    ip,
    userAgent,
  });
  if (!result.ok) return { status: "error", error: result.reason };
  if (result.backupCodes) return { status: "backup", codes: result.backupCodes };
  return redirect({ href: "/admin", locale });
}

// ─── Déconnexion ────────────────────────────────────────────────────────────

export async function signOutAction(): Promise<void> {
  const locale = await getLocale();
  await getAuth().api.signOut({ headers: await headers() });
  redirect({ href: "/", locale });
}

/** Ferme toutes les sessions de la personne connectée (tous ses appareils). */
export async function signOutEverywhereAction(): Promise<void> {
  const locale = await getLocale();
  const session = await getCurrentSession();
  if (session) {
    const { ip, userAgent } = await requestMeta();
    await revokeAllSessions(getDb(), session.user.id, { actorId: session.user.id, ip, userAgent });
  }
  redirect({ href: "/connexion", locale });
}
