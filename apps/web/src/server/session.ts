/** Accès à la session courante dans les pages et actions serveur. */
import "server-only";
import { sessions, users } from "@culinova/db/schema";
import { eq } from "drizzle-orm";
import { cookies, headers } from "next/headers";
import { cache } from "react";
import { redirect } from "@/i18n/navigation";
import { type Auth, createAuth } from "./auth";
import { getDb } from "./db";

const globalForAuth = globalThis as unknown as { culinovaAuth?: Auth };

export function getAuth(): Auth {
  globalForAuth.culinovaAuth ??= createAuth(getDb());
  return globalForAuth.culinovaAuth;
}

export interface CurrentSession {
  sessionId: string;
  twoFactorVerifiedAt: Date | null;
  impersonatedBy: string | null;
  user: {
    id: string;
    email: string;
    name: string;
    role: "user" | "admin";
    locale: string;
  };
}

/** Session de la requête en cours (une seule lecture par requête). */
export const getCurrentSession = cache(async (): Promise<CurrentSession | null> => {
  const result = await getAuth().api.getSession({ headers: await headers() });
  if (!result) return null;
  const db = getDb();
  const [row] = await db
    .select({
      sessionId: sessions.id,
      twoFactorVerifiedAt: sessions.twoFactorVerifiedAt,
      impersonatedBy: sessions.impersonatedBy,
      id: users.id,
      email: users.email,
      name: users.name,
      role: users.role,
      locale: users.locale,
      banned: users.banned,
    })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(eq(sessions.id, result.session.id));
  if (!row || row.banned) return null;
  return {
    sessionId: row.sessionId,
    twoFactorVerifiedAt: row.twoFactorVerifiedAt,
    impersonatedBy: row.impersonatedBy,
    user: { id: row.id, email: row.email, name: row.name, role: row.role, locale: row.locale },
  };
});

/** Exige une personne connectée, sinon renvoie vers la page de connexion. */
export async function requireUser(locale: string): Promise<CurrentSession> {
  const session = await getCurrentSession();
  if (!session) {
    // Un cookie de session sans session valide = session fermée (révocation, suspension, expiration).
    const hadSession = (await cookies()).getAll().some((c) => c.name.endsWith("culinova.session_token"));
    return redirect({ href: hadSession ? "/connexion?raison=session" : "/connexion", locale });
  }
  return session;
}

/** Exige un administrateur ayant validé son second facteur pour cette session. */
export async function requireAdmin(locale: string): Promise<CurrentSession> {
  const session = await requireUser(locale);
  if (session.user.role !== "admin" || session.impersonatedBy) return redirect({ href: "/app", locale });
  if (!session.twoFactorVerifiedAt) return redirect({ href: "/2fa", locale });
  return session;
}
