import { describe, expect, it } from "vitest";
import { hasTestDb, testDb, uniqueEmail } from "@/test/db";
import { isAllowed, RATE_RULES, recordAttempt } from "./rate-limit";

describe.skipIf(!hasTestDb)("limitation des tentatives", () => {
  it("bloque au-delà de 5 demandes de lien par adresse en 15 minutes", async () => {
    const db = testDb();
    const email = uniqueEmail();
    const check = () => isAllowed(db, "magic_link", [{ by: { email }, rule: RATE_RULES.magicLinkPerEmail }]);
    for (let i = 0; i < 5; i++) {
      expect(await check()).toBe(true);
      await recordAttempt(db, { kind: "magic_link", email, success: true });
    }
    expect(await check()).toBe(false);
    // Les autres adresses ne sont pas concernées.
    expect(
      await isAllowed(db, "magic_link", [
        { by: { email: uniqueEmail() }, rule: RATE_RULES.magicLinkPerEmail },
      ]),
    ).toBe(true);
  });

  it("ne compte que les échecs pour les codes d'invitation", async () => {
    const db = testDb();
    const ip = `192.0.2.${Math.floor(Math.random() * 250)}`;
    const check = () =>
      isAllowed(db, "invitation", [{ by: { ip }, rule: RATE_RULES.invitationFailuresPerIp }]);
    for (let i = 0; i < 20; i++) await recordAttempt(db, { kind: "invitation", ip, success: true });
    expect(await check()).toBe(true);
    for (let i = 0; i < 10; i++) await recordAttempt(db, { kind: "invitation", ip, success: false });
    expect(await check()).toBe(false);
  });

  it("ignore une règle dont le critère est inconnu (pas d'adresse IP)", async () => {
    expect(
      await isAllowed(testDb(), "invitation", [
        { by: { ip: undefined }, rule: RATE_RULES.invitationFailuresPerIp },
      ]),
    ).toBe(true);
  });
});
