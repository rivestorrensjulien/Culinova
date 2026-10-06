import { invitations } from "@culinova/db/schema";
import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { createTestUser, hasTestDb, testDb, uniqueEmail } from "@/test/db";
import { createInvitation, findInvitationByCode, invitationProblem } from "./invitations";

describe.skipIf(!hasTestDb)("invitations", () => {
  let adminId: string;
  beforeAll(async () => {
    adminId = (await createTestUser({ role: "admin" })).id;
  });

  it("retrouve une invitation quelle que soit la saisie du code", async () => {
    const { invitation, code } = await createInvitation(testDb(), { label: "Test" }, { actorId: adminId });
    const found = await findInvitationByCode(testDb(), code.toLowerCase().replace(/-/g, " "));
    expect(found?.id).toBe(invitation.id);
    expect(await findInvitationByCode(testDb(), "CULI-2222-2222")).toBeNull();
    expect(invitation.codeHash).not.toContain(code);
  });

  it("détecte les invitations inutilisables", async () => {
    const email = uniqueEmail();
    const { invitation } = await createInvitation(testDb(), { email }, { actorId: adminId });
    expect(invitationProblem(invitation, email)).toBeNull();
    expect(invitationProblem(invitation, email.toUpperCase())).toBeNull();
    expect(invitationProblem(invitation, uniqueEmail())).toBe("wrong_email");
    expect(invitationProblem(null)).toBe("invalid");
    expect(invitationProblem({ ...invitation, revokedAt: new Date() })).toBe("revoked");
    expect(invitationProblem({ ...invitation, redeemedAt: new Date() })).toBe("used");
    expect(invitationProblem({ ...invitation, expiresAt: new Date(Date.now() - 1000) })).toBe("expired");
  });

  it("normalise l'adresse e-mail d'une invitation nominative", async () => {
    const { invitation } = await createInvitation(
      testDb(),
      { email: "  Chef@Exemple.TEST " },
      { actorId: adminId },
    );
    const [row] = await testDb().select().from(invitations).where(eq(invitations.id, invitation.id));
    expect(row!.email).toBe("chef@exemple.test");
  });
});
