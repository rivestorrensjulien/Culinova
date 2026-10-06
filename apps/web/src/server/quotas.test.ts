import { SETTING_KEYS, siteSettings, users } from "@culinova/db/schema";
import { eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { createTestUser, hasTestDb, testDb } from "@/test/db";
import {
  consumeQuota,
  getAiBudgetCap,
  getAiSpend,
  getMonthlyUsage,
  getQuotaLimits,
  recordAiSpend,
  releaseQuota,
} from "./quotas";

describe.skipIf(!hasTestDb)("compteurs de quotas", () => {
  afterEach(async () => {
    await testDb()
      .update(siteSettings)
      .set({ value: { recipes: 5, images: 10, regenerations: 2 } })
      .where(eq(siteSettings.key, SETTING_KEYS.defaultQuotas));
  });

  it("applique les quotas par défaut de la V1", async () => {
    const user = await createTestUser();
    expect(await getQuotaLimits(testDb(), user.id)).toEqual({ recipes: 5, images: 10, regenerations: 2 });
  });

  it("applique les réglages de l'admin puis les exceptions personnelles", async () => {
    const db = testDb();
    const user = await createTestUser();
    await db
      .update(siteSettings)
      .set({ value: { recipes: 6, images: 12, regenerations: 3 } })
      .where(eq(siteSettings.key, SETTING_KEYS.defaultQuotas));
    expect(await getQuotaLimits(db, user.id)).toEqual({ recipes: 6, images: 12, regenerations: 3 });
    await db
      .update(users)
      .set({ quotaOverrides: { recipes: 20 } })
      .where(eq(users.id, user.id));
    expect(await getQuotaLimits(db, user.id)).toEqual({ recipes: 20, images: 12, regenerations: 3 });
  });

  it("ne limite pas les administrateurs", async () => {
    const admin = await createTestUser({ role: "admin" });
    expect(await getQuotaLimits(testDb(), admin.id)).toEqual({
      recipes: null,
      images: null,
      regenerations: null,
    });
    for (let i = 0; i < 7; i++) {
      expect((await consumeQuota(testDb(), { userId: admin.id, metric: "recipes" })).allowed).toBe(true);
    }
  });

  it("refuse la 6e recette du mois", async () => {
    const db = testDb();
    const user = await createTestUser();
    for (let i = 1; i <= 5; i++) {
      expect(await consumeQuota(db, { userId: user.id, metric: "recipes" })).toEqual({
        allowed: true,
        count: i,
        limit: 5,
      });
    }
    expect(await consumeQuota(db, { userId: user.id, metric: "recipes" })).toEqual({
      allowed: false,
      count: null,
      limit: 5,
    });
    const usage = await getMonthlyUsage(db, user.id);
    expect(usage.used).toEqual({ recipes: 5, images: 0 });
  });

  it("ne dépasse jamais la limite, même avec des demandes simultanées", async () => {
    const db = testDb();
    const user = await createTestUser();
    const results = await Promise.all(
      Array.from({ length: 25 }, () => consumeQuota(db, { userId: user.id, metric: "images" })),
    );
    expect(results.filter((r) => r.allowed)).toHaveLength(10);
    expect((await getMonthlyUsage(db, user.id)).used.images).toBe(10);
  });

  it("repart à zéro le mois suivant", async () => {
    const db = testDb();
    const user = await createTestUser();
    const october = new Date("2026-10-15T12:00:00Z");
    const november = new Date("2026-11-02T12:00:00Z");
    for (let i = 0; i < 5; i++) await consumeQuota(db, { userId: user.id, metric: "recipes", now: october });
    expect((await consumeQuota(db, { userId: user.id, metric: "recipes", now: october })).allowed).toBe(
      false,
    );
    expect((await consumeQuota(db, { userId: user.id, metric: "recipes", now: november })).allowed).toBe(
      true,
    );
    expect((await getMonthlyUsage(db, user.id, november)).resetsOn).toEqual({
      year: 2026,
      month: 12,
      day: 1,
    });
  });

  it("compte les régénérations par recette", async () => {
    const db = testDb();
    const user = await createTestUser();
    const recipeA = randomUUID();
    const recipeB = randomUUID();
    expect(
      (await consumeQuota(db, { userId: user.id, metric: "regenerations", recipeId: recipeA })).allowed,
    ).toBe(true);
    expect(
      (await consumeQuota(db, { userId: user.id, metric: "regenerations", recipeId: recipeA })).allowed,
    ).toBe(true);
    expect(
      (await consumeQuota(db, { userId: user.id, metric: "regenerations", recipeId: recipeA })).allowed,
    ).toBe(false);
    expect(
      (await consumeQuota(db, { userId: user.id, metric: "regenerations", recipeId: recipeB })).allowed,
    ).toBe(true);
    await expect(consumeQuota(db, { userId: user.id, metric: "regenerations" })).rejects.toThrow(/recipeId/);
  });

  it("rend du quota après un échec, sans descendre sous zéro", async () => {
    const db = testDb();
    const user = await createTestUser();
    await consumeQuota(db, { userId: user.id, metric: "recipes" });
    await releaseQuota(db, { userId: user.id, metric: "recipes" });
    await releaseQuota(db, { userId: user.id, metric: "recipes" });
    expect((await getMonthlyUsage(db, user.id)).used.recipes).toBe(0);
  });

  it("refuse une demande plus grande que la limite", async () => {
    const user = await createTestUser();
    expect((await consumeQuota(testDb(), { userId: user.id, metric: "images", amount: 11 })).allowed).toBe(
      false,
    );
  });

  it("additionne les dépenses IA du mois", async () => {
    const db = testDb();
    const when = new Date("2030-01-10T12:00:00Z");
    expect(await getAiSpend(db, when)).toBe(0);
    await recordAiSpend(db, 100_000, when);
    expect(await recordAiSpend(db, 50_000, when)).toBe(150_000);
    expect(await getAiSpend(db, when)).toBe(150_000);
    expect(await getAiBudgetCap(db)).toBeNull();
  });
});
