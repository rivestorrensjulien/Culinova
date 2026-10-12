import { auditLogs } from "@culinova/db/schema";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { hasTestDb, testDb } from "@/test/db";
import { purgeExpiredData } from "./purge";

describe.skipIf(!hasTestDb)("purge des données expirées", () => {
  it("efface le journal de plus de 12 mois et garde le reste", async () => {
    const db = testDb();
    const entity = `purge-${randomUUID()}`;
    const monthsAgo = (months: number) => {
      const date = new Date();
      date.setMonth(date.getMonth() - months);
      return date;
    };
    await db.insert(auditLogs).values([
      { action: "test.old", entity, at: monthsAgo(13) },
      { action: "test.recent", entity, at: monthsAgo(11) },
    ]);
    const result = await purgeExpiredData(db);
    expect(result.auditLogs).toBeGreaterThanOrEqual(1);
    const left = await db
      .select({ action: auditLogs.action })
      .from(auditLogs)
      .where(eq(auditLogs.entity, entity));
    expect(left).toEqual([{ action: "test.recent" }]);
  });
});
