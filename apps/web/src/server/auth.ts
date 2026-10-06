/**
 * Authentification (Better Auth) : connexion par lien magique, sans mot de passe.
 *
 * - Inscription UNIQUEMENT avec une invitation réservée pour l'adresse (hook user.create.before).
 * - À la création du compte : le code est lié au compte et les consentements enregistrés.
 * - Un compte suspendu ne peut plus ouvrir de session.
 * - Le second facteur des administrateurs est géré à part (voir two-factor.ts).
 */
import type { Database } from "@culinova/db";
import {
  authAccounts,
  consentRecords,
  legalDocuments,
  rateLimits,
  sessions,
  users,
  verificationTokens,
} from "@culinova/db/schema";
import { renderMagicLinkEmail, sendEmail } from "@culinova/emails";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { nextCookies } from "better-auth/next-js";
import { admin, magicLink } from "better-auth/plugins";
import { eq, inArray } from "drizzle-orm";
import { findReservationForEmail, redeemReservation } from "./access/invitations";
import { audit } from "./audit";

/**
 * Routes de Better Auth réservées aux appels internes (actions serveur de Culinova),
 * jamais accessibles directement depuis un navigateur :
 * - l'envoi de lien passe par nos actions (limitation des tentatives, comptes suspendus) ;
 * - les routes d'administration exigeraient sinon seulement le rôle, sans le second facteur.
 */
export function isServerOnlyAuthPath(path: string): boolean {
  return path === "/sign-in/magic-link" || path.startsWith("/admin/");
}

/** Durée de validité d'un lien magique : 15 minutes, usage unique. */
export const MAGIC_LINK_TTL_SECONDS = 15 * 60;

export function appUrl(): string {
  return (process.env.BETTER_AUTH_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").replace(
    /\/$/,
    "",
  );
}

/** Préfixe d'URL d'une langue (le français, langue par défaut, n'en a pas). */
export function localePrefix(locale: unknown): string {
  return locale === "en" ? "/en" : "";
}

/**
 * Le lien envoyé par e-mail mène à une page de confirmation (bouton « Me connecter »)
 * plutôt qu'à l'adresse qui consomme le jeton : les antivirus de messagerie qui
 * « ouvrent » les liens ne peuvent donc pas griller le lien à usage unique.
 */
export function toVerifierUrl(betterAuthUrl: string, locale: unknown): string {
  const source = new URL(betterAuthUrl);
  const target = new URL(`${appUrl()}${localePrefix(locale)}/connexion/verifier`);
  for (const key of ["token", "callbackURL", "newUserCallbackURL", "errorCallbackURL"]) {
    const value = source.searchParams.get(key);
    if (value) target.searchParams.set(key, value);
  }
  return target.toString();
}

export function createAuth(db: Database, options: { nextCookies?: boolean } = {}) {
  return betterAuth({
    appName: "Culinova",
    baseURL: appUrl(),
    secret: process.env.BETTER_AUTH_SECRET,
    trustedOrigins: [appUrl()],
    database: drizzleAdapter(db, {
      provider: "pg",
      schema: {
        user: users,
        session: sessions,
        account: authAccounts,
        verification: verificationTokens,
        rateLimit: rateLimits,
      },
    }),
    advanced: {
      cookiePrefix: "culinova",
      database: { generateId: "uuid" },
    },
    emailAndPassword: { enabled: false },
    user: {
      additionalFields: {
        locale: { type: "string", required: false, defaultValue: "fr", input: false },
      },
    },
    session: {
      expiresIn: 60 * 60 * 24 * 30,
      updateAge: 60 * 60 * 24,
    },
    rateLimit: { storage: "database", modelName: "rateLimit" },
    hooks: {
      before: createAuthMiddleware(async (ctx) => {
        if (ctx.request && isServerOnlyAuthPath(ctx.path)) {
          throw new APIError("FORBIDDEN", { code: "SERVER_ONLY", message: "Route réservée au serveur." });
        }
      }),
    },
    databaseHooks: {
      user: {
        create: {
          before: async (user) => {
            const reservation = await findReservationForEmail(db, user.email);
            if (!reservation) {
              throw new APIError("FORBIDDEN", {
                code: "INVITATION_REQUIRED",
                message: "Une invitation valide est nécessaire pour créer un compte.",
              });
            }
            return {
              data: {
                ...user,
                name: reservation.reservedName ?? user.name ?? "",
                locale: reservation.reservedConsents?.locale === "en" ? "en" : "fr",
              },
            };
          },
          after: async (user) => {
            const invitation = await redeemReservation(db, user.id, user.email);
            const consents = invitation?.reservedConsents;
            if (consents && consents.documentIds.length > 0) {
              const docs = await db
                .select({ id: legalDocuments.id, type: legalDocuments.type })
                .from(legalDocuments)
                .where(inArray(legalDocuments.id, consents.documentIds));
              await db.insert(consentRecords).values(
                docs.map((doc) => ({
                  userId: user.id,
                  legalDocumentId: doc.id,
                  consentType: doc.type,
                  granted: true,
                  context: "signup" as const,
                  ip: consents.ip,
                  userAgent: consents.userAgent,
                })),
              );
            }
            await audit(db, {
              actorId: user.id,
              action: "auth.signup",
              entity: "user",
              entityId: user.id,
              after: { email: user.email, invitationId: invitation?.id ?? null },
              ip: consents?.ip,
              userAgent: consents?.userAgent,
            });
          },
        },
      },
      session: {
        create: {
          before: async (session) => {
            const [user] = await db
              .select({ banned: users.banned, deletedAt: users.deletedAt })
              .from(users)
              .where(eq(users.id, session.userId));
            if (!user || user.banned || user.deletedAt) return false;
          },
          after: async (session) => {
            await db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, session.userId));
            await audit(db, {
              actorId: session.userId,
              action: "auth.login",
              entity: "session",
              entityId: session.id,
              ip: session.ipAddress ?? null,
              userAgent: session.userAgent ?? null,
            });
          },
        },
      },
    },
    plugins: [
      magicLink({
        expiresIn: MAGIC_LINK_TTL_SECONDS,
        storeToken: "hashed",
        sendMagicLink: async ({ email, url, metadata }) => {
          const locale = metadata?.locale === "en" ? "en" : "fr";
          const link = toVerifierUrl(url, locale);
          const rendered = await renderMagicLinkEmail({
            url: link,
            expiresInMinutes: MAGIC_LINK_TTL_SECONDS / 60,
            locale,
          });
          await sendEmail({ to: email, ...rendered, tag: "magic-link", url: link });
        },
      }),
      admin({
        adminRoles: ["admin"],
        defaultRole: "user",
        impersonationSessionDuration: 60 * 60,
      }),
      ...(options.nextCookies === false ? [] : [nextCookies()]),
    ],
  });
}

export type Auth = ReturnType<typeof createAuth>;
