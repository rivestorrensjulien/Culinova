/**
 * Scénario de fin du jalon J1, de bout en bout côté serveur :
 * l'admin crée un code → une personne s'inscrit avec → l'admin révoque le code
 * → elle est déconnectée de tous ses appareils et ne peut plus se reconnecter.
 */
import { auditLogs, consentRecords, invitations, sessions, users } from "@culinova/db/schema";
import { and, eq, sql } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { createTestUser, hasTestDb, testDb, uniqueEmail } from "@/test/db";
import { lastEmailTo } from "@/test/outbox";
import {
  currentSignupDocuments,
  createInvitation,
  reserveInvitation,
  restoreInvitation,
  revokeInvitation,
} from "./access/invitations";
import { type Auth, createAuth, toVerifierUrl } from "./auth";

const BASE = "http://localhost:3000";

/** Demande un lien magique puis « clique » dessus. Renvoie le cookie de session éventuel. */
async function signInWithMagicLink(
  auth: Auth,
  email: string,
  extra: Record<string, string> = {},
): Promise<{ cookie: string | null; location: string | null }> {
  await auth.api.signInMagicLink({
    body: { email, callbackURL: "/app", errorCallbackURL: "/connexion?raison=lien", ...extra },
    headers: new Headers({ "user-agent": "vitest", "x-forwarded-for": "203.0.113.7" }),
  });
  const mail = await lastEmailTo(email, "magic-link");
  expect(mail?.url).toBeTruthy();
  // Le lien de l'e-mail mène à la page de confirmation ; son bouton appelle l'API de vérification.
  const verifierUrl = new URL(mail!.url!);
  expect(verifierUrl.pathname).toBe("/connexion/verifier");
  const response = await auth.handler(
    new Request(`${BASE}/api/auth/magic-link/verify?${verifierUrl.searchParams.toString()}`, {
      headers: { "user-agent": "vitest", "x-forwarded-for": "203.0.113.7" },
    }),
  );
  const cookie =
    response.headers
      .getSetCookie()
      .map((c) => c.split(";")[0]!)
      .find((c) => c.startsWith("culinova.session_token=") && !c.endsWith("=")) ?? null;
  return { cookie, location: response.headers.get("location") };
}

async function sessionFor(auth: Auth, cookie: string) {
  return auth.api.getSession({ headers: new Headers({ cookie }) });
}

describe.skipIf(!hasTestDb)("parcours d'inscription sur invitation et révocation", () => {
  let auth: Auth;
  let adminId: string;

  beforeAll(async () => {
    auth = createAuth(testDb(), { nextCookies: false });
    adminId = (await createTestUser({ role: "admin" })).id;
  });

  it("refuse les appels directs aux routes réservées au serveur", async () => {
    const post = (path: string) =>
      auth.handler(
        new Request(`${BASE}/api/auth${path}`, {
          method: "POST",
          headers: { "content-type": "application/json", origin: BASE },
          body: JSON.stringify({ email: uniqueEmail() }),
        }),
      );
    expect((await post("/sign-in/magic-link")).status).toBe(403);
    expect((await post("/admin/set-role")).status).toBe(403);
    const listUsers = await auth.handler(
      new Request(`${BASE}/api/auth/admin/list-users`, { headers: { origin: BASE } }),
    );
    expect(listUsers.status).toBe(403);
  });

  it("transforme le lien Better Auth en lien vers la page de confirmation", () => {
    const url = toVerifierUrl(
      `${BASE}/api/auth/magic-link/verify?token=abc&callbackURL=%2Fapp&foo=bar`,
      "en",
    );
    expect(url).toBe(`${BASE}/en/connexion/verifier?token=abc&callbackURL=%2Fapp`);
  });

  it("refuse de créer un compte sans invitation", async () => {
    const email = uniqueEmail("intrus");
    const { cookie, location } = await signInWithMagicLink(auth, email);
    expect(cookie).toBeNull();
    expect(location).toBe(
      `${BASE}/connexion?raison=lien&error=INVITATION_REQUIRED&error_description=${encodeURIComponent("Une invitation valide est nécessaire pour créer un compte.").replace(/%20/g, "+")}`,
    );
    const found = await testDb().select().from(users).where(eq(users.email, email));
    expect(found).toHaveLength(0);
  });

  it("inscrit une personne avec son code, puis la déconnecte partout à la révocation", async () => {
    const db = testDb();
    const ctx = { actorId: adminId, ip: "198.51.100.1", userAgent: "admin" };
    const email = uniqueEmail("chef");

    // 1. L'admin crée un code nominatif.
    const { invitation, code } = await createInvitation(db, { label: "Chef test", email }, ctx);
    expect(code).toMatch(/^CULI-/);

    // 2. La personne saisit le code, accepte les documents : l'invitation est réservée.
    const documents = await currentSignupDocuments(db, "fr");
    expect(documents.map((d) => d.type)).toEqual(["cgu", "privacy"]);
    expect(
      await reserveInvitation(db, invitation.id, {
        email,
        name: "Chef Test",
        documentIds: documents.map((d) => d.id),
        locale: "fr",
        ip: "203.0.113.7",
        userAgent: "vitest",
      }),
    ).toBe(true);

    // 3. Elle clique sur le lien reçu : le compte est créé et connecté sur deux appareils.
    const first = await signInWithMagicLink(auth, email, { newUserCallbackURL: "/app?bienvenue=1" });
    expect(first.cookie).toBeTruthy();
    expect(first.location).toBe(`${BASE}/app?bienvenue=1`);
    const second = await signInWithMagicLink(auth, email);
    expect(second.cookie).toBeTruthy();

    const [user] = await db.select().from(users).where(eq(users.email, email));
    expect(user).toMatchObject({ name: "Chef Test", role: "user", banned: false, locale: "fr" });
    expect(user!.lastLoginAt).toBeInstanceOf(Date);

    const [redeemed] = await db.select().from(invitations).where(eq(invitations.id, invitation.id));
    expect(redeemed!.redeemedBy).toBe(user!.id);

    const consents = await db.select().from(consentRecords).where(eq(consentRecords.userId, user!.id));
    expect(consents.map((c) => c.consentType).sort()).toEqual(["cgu", "privacy"]);
    expect(consents[0]).toMatchObject({ granted: true, context: "signup", ip: "203.0.113.7" });

    expect((await sessionFor(auth, first.cookie!))?.user.email).toBe(email);
    expect((await sessionFor(auth, second.cookie!))?.user.email).toBe(email);

    // Le code ne peut plus servir à une autre personne.
    expect(
      await reserveInvitation(db, invitation.id, {
        email: uniqueEmail(),
        name: "",
        documentIds: [],
        locale: "fr",
        ip: null,
        userAgent: null,
      }),
    ).toBe(false);

    // 4. L'admin révoque le code : compte suspendu, plus aucune session.
    await revokeInvitation(db, invitation.id, ctx);
    const [suspended] = await db.select().from(users).where(eq(users.id, user!.id));
    expect(suspended).toMatchObject({ banned: true, banReason: "invitation_revoked" });
    expect(await db.select().from(sessions).where(eq(sessions.userId, user!.id))).toHaveLength(0);
    expect(await sessionFor(auth, first.cookie!)).toBeNull();
    expect(await sessionFor(auth, second.cookie!)).toBeNull();

    // 5. Impossible de se reconnecter tant que le compte est suspendu.
    const blocked = await signInWithMagicLink(auth, email);
    expect(blocked.cookie).toBeNull();

    // 6. Le code est rétabli : le compte est réactivé, ses données sont intactes.
    await restoreInvitation(db, invitation.id, ctx);
    const again = await signInWithMagicLink(auth, email);
    expect(again.cookie).toBeTruthy();

    const actions = await db
      .select({ action: auditLogs.action })
      .from(auditLogs)
      .where(
        sql`${auditLogs.entityId} in (${user!.id}, ${invitation.id}) or ${auditLogs.actorId} = ${user!.id}`,
      );
    const names = actions.map((a) => a.action);
    const [login] = await db
      .select()
      .from(auditLogs)
      .where(and(eq(auditLogs.actorId, user!.id), eq(auditLogs.action, "auth.login")));
    expect(login).toMatchObject({ entity: "session", ip: "203.0.113.7", userAgent: "vitest" });
    for (const expected of [
      "invitation.create",
      "auth.signup",
      "auth.login",
      "invitation.revoke",
      "user.suspend",
      "user.sessions.revoke",
      "invitation.restore",
      "user.reactivate",
    ]) {
      expect(names).toContain(expected);
    }
  });

  it("refuse une réservation expirée (plus de 30 minutes)", async () => {
    const db = testDb();
    const email = uniqueEmail("lent");
    const { invitation } = await createInvitation(db, {}, { actorId: adminId });
    await reserveInvitation(db, invitation.id, {
      email,
      name: "",
      documentIds: [],
      locale: "fr",
      ip: null,
      userAgent: null,
    });
    await db
      .update(invitations)
      .set({ reservedAt: new Date(Date.now() - 31 * 60 * 1000) })
      .where(eq(invitations.id, invitation.id));
    const { cookie } = await signInWithMagicLink(auth, email);
    expect(cookie).toBeNull();
    const [row] = await db
      .select()
      .from(invitations)
      .where(and(eq(invitations.id, invitation.id)));
    expect(row!.redeemedBy).toBeNull();
  });
});
