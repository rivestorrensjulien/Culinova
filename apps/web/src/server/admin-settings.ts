/**
 * Réglages de l'administration : quotas par défaut, plafond de budget IA,
 * exceptions de quotas par personne. Chaque changement est inscrit au journal d'audit.
 */
import {
  parseQuotaOverrides,
  type QuotaLimits,
  type QuotaOverrides,
  resolveQuotaLimits,
} from "@culinova/core";
import type { Database } from "@culinova/db";
import { SETTING_KEYS, siteSettings, users } from "@culinova/db/schema";
import { eq } from "drizzle-orm";
import type { ActorContext } from "./access/users";
import { audit } from "./audit";
import { getAiBudgetCap } from "./quotas";

async function readSetting(db: Database, key: string): Promise<unknown> {
  const [row] = await db
    .select({ value: siteSettings.value })
    .from(siteSettings)
    .where(eq(siteSettings.key, key));
  return row?.value;
}

async function writeSetting(db: Database, key: string, value: unknown): Promise<void> {
  await db
    .insert(siteSettings)
    .values({ key, value })
    .onConflictDoUpdate({ target: siteSettings.key, set: { value, updatedAt: new Date() } });
}

/** Quotas par défaut appliqués à toutes les personnes (null = sans limite). */
export async function getDefaultQuotas(db: Database): Promise<QuotaLimits> {
  return resolveQuotaLimits(parseQuotaOverrides(await readSetting(db, SETTING_KEYS.defaultQuotas)));
}

export async function saveDefaultQuotas(db: Database, limits: QuotaLimits, ctx: ActorContext): Promise<void> {
  const before = await getDefaultQuotas(db);
  await writeSetting(db, SETTING_KEYS.defaultQuotas, limits);
  await audit(db, {
    ...ctx,
    action: "settings.quotas.update",
    entity: "site_settings",
    before,
    after: limits,
  });
}

export async function saveAiBudgetCap(
  db: Database,
  capUsdMicros: number | null,
  ctx: ActorContext,
): Promise<void> {
  const before = await getAiBudgetCap(db);
  await writeSetting(db, SETTING_KEYS.monthlyAiBudget, { capUsdMicros });
  await audit(db, {
    ...ctx,
    action: "settings.ai_budget.update",
    entity: "site_settings",
    before: { capUsdMicros: before },
    after: { capUsdMicros },
  });
}

/** Exceptions de quotas d'une personne (vide = valeurs par défaut). */
export async function getUserQuotaOverrides(db: Database, userId: string): Promise<QuotaOverrides> {
  const [row] = await db.select({ overrides: users.quotaOverrides }).from(users).where(eq(users.id, userId));
  return parseQuotaOverrides(row?.overrides);
}

export async function saveUserQuotaOverrides(
  db: Database,
  userId: string,
  overrides: QuotaOverrides,
  ctx: ActorContext,
): Promise<void> {
  const before = await getUserQuotaOverrides(db, userId);
  const entries = Object.entries(overrides).filter(
    (entry): entry is [string, number | null] => entry[1] !== undefined,
  );
  const value = entries.length > 0 ? Object.fromEntries(entries) : null;
  const [row] = await db
    .update(users)
    .set({ quotaOverrides: value })
    .where(eq(users.id, userId))
    .returning({ id: users.id });
  if (!row) throw new Error("Utilisateur introuvable");
  await audit(db, {
    ...ctx,
    action: "user.quotas.update",
    entity: "user",
    entityId: userId,
    before,
    after: value ?? {},
  });
}
