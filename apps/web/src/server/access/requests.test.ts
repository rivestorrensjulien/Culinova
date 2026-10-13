import { invitationRequests, invitations } from "@culinova/db/schema";
import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { createTestUser, hasTestDb, testDb, uniqueEmail } from "@/test/db";
import { lastEmailTo } from "@/test/outbox";
import { findInvitationByCode } from "./invitations";
import {
  acceptInvitationRequest,
  declineInvitationRequest,
  listInvitationRequests,
  submitInvitationRequest,
} from "./requests";

const ip = () =>
  `10.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`;
const meta = () => ({ ip: ip(), userAgent: "vitest" });

async function requestsFor(email: string) {
  return testDb().select().from(invitationRequests).where(eq(invitationRequests.email, email));
}

describe.skipIf(!hasTestDb)("demandes d'invitation", () => {
  let admin: { id: string; email: string };
  beforeAll(async () => {
    admin = await createTestUser({ role: "admin" });
  });

  it("enregistre la demande, accuse réception et prévient l'administrateur", async () => {
    const email = uniqueEmail();
    const result = await submitInvitationRequest(
      testDb(),
      {
        name: "Camille",
        email: email.toUpperCase(),
        profile: "chef",
        message: "Pour mes menus.",
        locale: "fr",
      },
      meta(),
    );
    expect(result).toEqual({ ok: true });
    const [row] = await requestsFor(email);
    expect(row).toMatchObject({ name: "Camille", profile: "chef", status: "pending", locale: "fr" });
    expect(row!.consentedAt).not.toBeNull();
    expect((await lastEmailTo(email, "invitation-request"))?.subject).toBe(
      "Votre demande d'invitation à Culinova",
    );
    expect((await lastEmailTo(admin.email, "invitation-request-alert"))?.subject).toContain("Camille");

    // Une seconde demande en attente pour la même adresse n'est pas dupliquée.
    await submitInvitationRequest(
      testDb(),
      { name: "Camille", email, profile: null, message: null, locale: "fr" },
      meta(),
    );
    expect(await requestsFor(email)).toHaveLength(1);
  });

  it("ne révèle pas qu'une adresse est déjà inscrite", async () => {
    const user = await createTestUser();
    const result = await submitInvitationRequest(
      testDb(),
      { name: "Déjà là", email: user.email, profile: null, message: null, locale: "fr" },
      meta(),
    );
    expect(result).toEqual({ ok: true });
    expect(await requestsFor(user.email)).toHaveLength(0);
  });

  it("limite les demandes répétées depuis une même adresse IP", async () => {
    const same = { ip: ip(), userAgent: "vitest" };
    for (let i = 0; i < 5; i++) {
      const r = await submitInvitationRequest(
        testDb(),
        { name: "Robot", email: uniqueEmail(), profile: null, message: null, locale: "fr" },
        same,
      );
      expect(r.ok).toBe(true);
    }
    const blocked = await submitInvitationRequest(
      testDb(),
      { name: "Robot", email: uniqueEmail(), profile: null, message: null, locale: "fr" },
      same,
    );
    expect(blocked).toEqual({ ok: false, reason: "rate_limited" });
  });

  it("invite : code nominatif envoyé dans la langue de la demande", async () => {
    const email = uniqueEmail();
    await submitInvitationRequest(
      testDb(),
      { name: "Sam", email, profile: "creator", message: null, locale: "en" },
      meta(),
    );
    const [request] = await requestsFor(email);
    expect(
      await acceptInvitationRequest(testDb(), request!.id, { actorId: admin.id }, { expiresInDays: 30 }),
    ).toEqual({
      ok: true,
    });
    const [after] = await requestsFor(email);
    expect(after).toMatchObject({ status: "invited", decidedBy: admin.id });
    const [invitation] = await testDb()
      .select()
      .from(invitations)
      .where(eq(invitations.id, after!.invitationId!));
    expect(invitation).toMatchObject({ email, label: "Sam" });
    expect(invitation!.sentAt).not.toBeNull();
    const sent = await lastEmailTo(email, "invitation");
    expect(sent?.subject).toBe("Your invitation to Culinova");
    const code = sent!.url!.split("/invitation/")[1]!;
    expect((await findInvitationByCode(testDb(), code))?.id).toBe(invitation!.id);
    // Une décision ne se prend qu'une fois.
    expect(await declineInvitationRequest(testDb(), request!.id, { actorId: admin.id })).toEqual({
      ok: false,
      reason: "already_decided",
    });
  });

  it("refuse une demande sans envoyer d'e-mail", async () => {
    const email = uniqueEmail();
    await submitInvitationRequest(
      testDb(),
      { name: "Lou", email, profile: null, message: null, locale: "fr" },
      meta(),
    );
    const [request] = await requestsFor(email);
    expect(await declineInvitationRequest(testDb(), request!.id, { actorId: admin.id })).toEqual({
      ok: true,
    });
    expect((await requestsFor(email))[0]!.status).toBe("declined");
    expect(await lastEmailTo(email, "invitation")).toBeNull();
    const declined = await listInvitationRequests(testDb(), "declined");
    expect(declined.some((r) => r.email === email)).toBe(true);
  });
});
