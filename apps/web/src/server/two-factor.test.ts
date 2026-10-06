import { sessions, twoFactor } from "@culinova/db/schema";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { createTestUser, hasTestDb, testDb } from "@/test/db";
import {
  currentTotpCode,
  decryptSecret,
  encryptSecret,
  getTwoFactor,
  MAX_FAILED_ATTEMPTS,
  startEnrollment,
  verifyAndMarkSession,
} from "./two-factor";

async function adminWithSession() {
  const admin = await createTestUser({ role: "admin" });
  const [session] = await testDb()
    .insert(sessions)
    .values({ token: `t-${admin.id}`, userId: admin.id, expiresAt: new Date(Date.now() + 3_600_000) })
    .returning();
  return { admin, session: session! };
}

async function sessionVerifiedAt(id: string) {
  const [row] = await testDb().select().from(sessions).where(eq(sessions.id, id));
  return row!.twoFactorVerifiedAt;
}

describe("chiffrement du secret", () => {
  it("chiffre et déchiffre", () => {
    const encrypted = encryptSecret("JBSWY3DPEHPK3PXP");
    expect(encrypted).not.toContain("JBSWY3DPEHPK3PXP");
    expect(encrypted).not.toBe(encryptSecret("JBSWY3DPEHPK3PXP"));
    expect(decryptSecret(encrypted)).toBe("JBSWY3DPEHPK3PXP");
  });

  it("détecte une altération", () => {
    const [v, iv, tag, data] = encryptSecret("JBSWY3DPEHPK3PXP").split(":");
    const tampered = [v, iv, tag, `${data!.slice(0, -2)}AA`].join(":");
    expect(() => decryptSecret(tampered)).toThrow();
  });
});

describe.skipIf(!hasTestDb)("second facteur des administrateurs", () => {
  it("active le second facteur au premier code valide et marque la session", async () => {
    const db = testDb();
    const { admin, session } = await adminWithSession();
    const { secret, uri } = await startEnrollment(db, admin.id, admin.email);
    expect(uri).toMatch(/^otpauth:\/\/totp\/Culinova:/);
    // Recharger la page d'enrôlement réutilise le même secret.
    expect((await startEnrollment(db, admin.id, admin.email)).secret).toBe(secret);

    const wrong = await verifyAndMarkSession(db, {
      userId: admin.id,
      email: admin.email,
      sessionId: session.id,
      code: "000000",
    });
    expect(wrong).toEqual({ ok: false, reason: "invalid" });
    expect(await sessionVerifiedAt(session.id)).toBeNull();

    const now = new Date();
    const result = await verifyAndMarkSession(
      db,
      { userId: admin.id, email: admin.email, sessionId: session.id, code: currentTotpCode(secret, now) },
      now,
    );
    expect(result.ok).toBe(true);
    expect(result.ok && result.backupCodes).toHaveLength(10);
    expect(await sessionVerifiedAt(session.id)).toBeInstanceOf(Date);
    expect((await getTwoFactor(db, admin.id))?.enabledAt).toBeInstanceOf(Date);
    await expect(startEnrollment(db, admin.id, admin.email)).rejects.toThrow(/déjà activé/);
  });

  it("refuse la réutilisation d'un code et accepte chaque code de secours une seule fois", async () => {
    const db = testDb();
    const { admin, session } = await adminWithSession();
    const { secret } = await startEnrollment(db, admin.id, admin.email);
    const now = new Date();
    const code = currentTotpCode(secret, now);
    const enrolled = await verifyAndMarkSession(
      db,
      { userId: admin.id, email: admin.email, sessionId: session.id, code },
      now,
    );
    const backup = enrolled.ok ? enrolled.backupCodes![0]! : "";

    const replay = await verifyAndMarkSession(
      db,
      { userId: admin.id, email: admin.email, sessionId: session.id, code },
      now,
    );
    expect(replay).toEqual({ ok: false, reason: "invalid" });

    const input = { userId: admin.id, email: admin.email, sessionId: session.id, code: backup.toLowerCase() };
    expect(await verifyAndMarkSession(db, input)).toEqual({ ok: true, method: "backup" });
    expect(await verifyAndMarkSession(db, input)).toEqual({ ok: false, reason: "invalid" });
    expect((await getTwoFactor(db, admin.id))?.backupCodesHash).toHaveLength(9);
  });

  it(`bloque la saisie après ${MAX_FAILED_ATTEMPTS} erreurs`, async () => {
    const db = testDb();
    const { admin, session } = await adminWithSession();
    const { secret } = await startEnrollment(db, admin.id, admin.email);
    const input = { userId: admin.id, email: admin.email, sessionId: session.id, code: "123456" };
    for (let i = 1; i < MAX_FAILED_ATTEMPTS; i++) {
      expect(await verifyAndMarkSession(db, input)).toEqual({ ok: false, reason: "invalid" });
    }
    expect(await verifyAndMarkSession(db, input)).toEqual({ ok: false, reason: "locked" });
    // Même un bon code est refusé pendant le blocage.
    const good = { ...input, code: currentTotpCode(secret) };
    expect(await verifyAndMarkSession(db, good)).toEqual({ ok: false, reason: "locked" });
    // Après 15 minutes, le bon code est de nouveau accepté.
    const later = new Date(Date.now() + 16 * 60 * 1000);
    const result = await verifyAndMarkSession(db, { ...input, code: currentTotpCode(secret, later) }, later);
    expect(result.ok).toBe(true);
    const [row] = await db.select().from(twoFactor).where(eq(twoFactor.userId, admin.id));
    expect(row).toMatchObject({ failedAttempts: 0, lockedUntil: null });
  });

  it("signale l'absence d'enrôlement", async () => {
    const { admin, session } = await adminWithSession();
    expect(
      await verifyAndMarkSession(testDb(), {
        userId: admin.id,
        email: admin.email,
        sessionId: session.id,
        code: "123456",
      }),
    ).toEqual({ ok: false, reason: "not_enrolled" });
  });
});
