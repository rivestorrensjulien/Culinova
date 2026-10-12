import { auditLogs } from "@culinova/db/schema";
import { and, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { createTestUser, hasTestDb, testDb } from "@/test/db";
import { getUserQuotaOverrides, saveUserQuotaOverrides } from "./admin-settings";
import { getQuotaLimits } from "./quotas";

describe.skipIf(!hasTestDb)("réglages de l'administration", () => {
  it("enregistre les exceptions de quotas d'une personne et les trace", async () => {
    const db = testDb();
    const admin = await createTestUser({ role: "admin" });
    const user = await createTestUser();
    await saveUserQuotaOverrides(db, user.id, { recipes: 12, images: 0 }, { actorId: admin.id });
    expect(await getUserQuotaOverrides(db, user.id)).toEqual({ recipes: 12, images: 0 });
    const limits = await getQuotaLimits(db, user.id);
    expect(limits.recipes).toBe(12);
    expect(limits.images).toBe(0);

    // Tout vider = retour aux valeurs par défaut.
    await saveUserQuotaOverrides(db, user.id, {}, { actorId: admin.id });
    expect(await getUserQuotaOverrides(db, user.id)).toEqual({});

    const entries = await db
      .select()
      .from(auditLogs)
      .where(and(eq(auditLogs.action, "user.quotas.update"), eq(auditLogs.entityId, user.id)));
    expect(entries).toHaveLength(2);
    expect(entries.every((e) => e.actorId === admin.id)).toBe(true);
  });
});
