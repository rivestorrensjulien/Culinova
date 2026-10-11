/**
 * Réglages de chiffrage du compte (coefficient, TVA, coût horaire, prix du kWh,
 * appareils) et paramètres de prix de chaque recette. Les montants calculés
 * (coût de revient, prix conseillé, marges) ne sont jamais enregistrés :
 * ils sont recalculés à l'affichage (voir pricingSheet dans @culinova/core).
 */
import { addVat, removeVat } from "@culinova/core";
import type { Database } from "@culinova/db";
import * as s from "@culinova/db/schema";
import { and, asc, desc, eq, isNull } from "drizzle-orm";
import { DEFAULT_COEFFICIENT, DEFAULT_VAT_RATE, VAT_RATES } from "./vat";

export { DEFAULT_COEFFICIENT, DEFAULT_VAT_RATE, VAT_RATES };

/** Appareils courants proposés en un clic (puissance moyenne, en watts). */
export const COMMON_APPLIANCES = [
  { name: "Four", powerW: 3000 },
  { name: "Plaque à induction", powerW: 2000 },
  { name: "Friteuse", powerW: 2500 },
  { name: "Four à micro-ondes", powerW: 1000 },
  { name: "Robot / mixeur", powerW: 800 },
] as const;

const LIMITS = {
  coefficient: { min: 0.1, max: 50 },
  hourlyRateCents: 100_000,
  kwhPriceCents: 1_000,
  powerW: { min: 1, max: 30_000 },
  /** Durées : 24 h au plus pour un lot. */
  seconds: 24 * 3600,
  sellingPriceCents: 10_000_000,
};

export interface CostingSettingsView {
  coefficient: number;
  vatRate: number;
  /** Coût horaire chargé de la main-d'œuvre, en centimes (null : non renseigné). */
  hourlyRateCents: number | null;
  /** Prix du kWh, en centimes (null : non renseigné). */
  kwhPriceCents: number | null;
}

export interface ApplianceView {
  id: string;
  name: string;
  powerW: number;
}

export interface RecipePricingView {
  coefficient: number | null;
  vatRate: number | null;
  /** Prix de vente TTC d'une portion, tel que saisi (null : seul le prix conseillé est affiché). */
  sellingPriceTtcCents: number | null;
  /** Temps de travail pour le lot (null : temps de préparation de la recette). */
  laborSeconds: number | null;
  energyUses: Array<{ applianceId: string; seconds: number }>;
}

export interface PricingContext {
  settings: CostingSettingsView;
  appliances: ApplianceView[];
  /** Paramètres enregistrés pour cette recette (ou sa version précédente), sinon null. */
  pricing: RecipePricingView | null;
}

const isVatRate = (value: number) => (VAT_RATES as readonly number[]).includes(value);
const inRange = (value: number, min: number, max: number) =>
  Number.isFinite(value) && value >= min && value <= max;

export async function getCostingSettings(db: Database, userId: string): Promise<CostingSettingsView> {
  const [row] = await db.select().from(s.costingSettings).where(eq(s.costingSettings.ownerId, userId));
  return {
    coefficient: row ? Number(row.defaultCoefficient) : DEFAULT_COEFFICIENT,
    vatRate: row ? Number(row.defaultVatRate) : DEFAULT_VAT_RATE,
    hourlyRateCents: row?.hourlyRateCents ?? null,
    kwhPriceCents: row?.kwhPriceCents ?? null,
  };
}

export type SaveSettingsResult = { ok: true; settings: CostingSettingsView } | { ok: false; field: string };

export async function saveCostingSettings(
  db: Database,
  userId: string,
  input: CostingSettingsView,
): Promise<SaveSettingsResult> {
  if (!inRange(input.coefficient, LIMITS.coefficient.min, LIMITS.coefficient.max)) {
    return { ok: false, field: "coefficient" };
  }
  if (!isVatRate(input.vatRate)) return { ok: false, field: "vatRate" };
  for (const [field, value, max] of [
    ["hourlyRate", input.hourlyRateCents, LIMITS.hourlyRateCents],
    ["kwhPrice", input.kwhPriceCents, LIMITS.kwhPriceCents],
  ] as const) {
    if (value !== null && (!Number.isInteger(value) || !inRange(value, 0, max))) return { ok: false, field };
  }
  const values = {
    defaultCoefficient: input.coefficient.toFixed(4),
    defaultVatRate: input.vatRate.toFixed(2),
    hourlyRateCents: input.hourlyRateCents,
    kwhPriceCents: input.kwhPriceCents,
  };
  await db
    .insert(s.costingSettings)
    .values({ ownerId: userId, ...values })
    .onConflictDoUpdate({ target: s.costingSettings.ownerId, set: { ...values, updatedAt: new Date() } });
  return { ok: true, settings: await getCostingSettings(db, userId) };
}

export async function listAppliances(db: Database, userId: string): Promise<ApplianceView[]> {
  return db
    .select({ id: s.appliances.id, name: s.appliances.name, powerW: s.appliances.powerW })
    .from(s.appliances)
    .where(eq(s.appliances.ownerId, userId))
    .orderBy(asc(s.appliances.createdAt), asc(s.appliances.name));
}

export async function addAppliance(
  db: Database,
  userId: string,
  input: { name: string; powerW: number },
): Promise<ApplianceView | null> {
  const name = input.name.trim().slice(0, 80);
  if (!name || !Number.isInteger(input.powerW)) return null;
  if (!inRange(input.powerW, LIMITS.powerW.min, LIMITS.powerW.max)) return null;
  const [row] = await db
    .insert(s.appliances)
    .values({ ownerId: userId, name, powerW: input.powerW })
    .returning({ id: s.appliances.id, name: s.appliances.name, powerW: s.appliances.powerW });
  return row ?? null;
}

/** Ajoute les appareils courants qui ne figurent pas encore dans la liste (par nom). */
export async function addCommonAppliances(db: Database, userId: string): Promise<ApplianceView[]> {
  const existing = new Set((await listAppliances(db, userId)).map((a) => a.name.toLowerCase()));
  const missing = COMMON_APPLIANCES.filter((a) => !existing.has(a.name.toLowerCase()));
  if (missing.length > 0) {
    await db.insert(s.appliances).values(missing.map((a) => ({ ownerId: userId, ...a })));
  }
  return listAppliances(db, userId);
}

export async function removeAppliance(db: Database, userId: string, applianceId: string): Promise<boolean> {
  const rows = await db
    .delete(s.appliances)
    .where(and(eq(s.appliances.id, applianceId), eq(s.appliances.ownerId, userId)))
    .returning({ id: s.appliances.id });
  return rows.length > 0;
}

function toView(row: typeof s.recipePricing.$inferSelect): RecipePricingView {
  const labor = row.laborSeconds;
  const laborSeconds =
    labor && (labor.prep !== undefined || labor.watch !== undefined || labor.plating !== undefined)
      ? (labor.prep ?? 0) + (labor.watch ?? 0) + (labor.plating ?? 0)
      : null;
  return {
    coefficient: row.coefficient === null ? null : Number(row.coefficient),
    vatRate: row.vatRate === null ? null : Number(row.vatRate),
    sellingPriceTtcCents:
      row.sellingPriceTtcCents ??
      (row.sellingPriceHtCents === null
        ? null
        : addVat(row.sellingPriceHtCents, row.vatRate === null ? DEFAULT_VAT_RATE : Number(row.vatRate))),
    laborSeconds,
    energyUses: row.energyUses ?? [],
  };
}

/**
 * Paramètres de prix d'une version. Une version régénérée reprend ceux de la
 * version la plus récemment chiffrée de la même recette.
 */
export async function loadRecipePricing(
  db: Database,
  recipeId: string,
  versionId: string,
): Promise<RecipePricingView | null> {
  const [own] = await db.select().from(s.recipePricing).where(eq(s.recipePricing.recipeVersionId, versionId));
  if (own) return toView(own);
  const [previous] = await db
    .select({ pricing: s.recipePricing })
    .from(s.recipePricing)
    .innerJoin(s.recipeVersions, eq(s.recipeVersions.id, s.recipePricing.recipeVersionId))
    .where(eq(s.recipeVersions.recipeId, recipeId))
    .orderBy(desc(s.recipePricing.updatedAt))
    .limit(1);
  return previous ? toView(previous.pricing) : null;
}

export async function loadPricingContext(
  db: Database,
  userId: string,
  recipeId: string,
  versionId: string,
): Promise<PricingContext> {
  const [settings, appliances, pricing] = await Promise.all([
    getCostingSettings(db, userId),
    listAppliances(db, userId),
    loadRecipePricing(db, recipeId, versionId),
  ]);
  return { settings, appliances, pricing };
}

export type SavePricingResult = { ok: true } | { ok: false; reason: "not_found" | "invalid"; field?: string };

/** Enregistre les paramètres de prix de la version active d'une recette de la personne. */
export async function saveRecipePricing(
  db: Database,
  userId: string,
  recipeId: string,
  input: RecipePricingView,
): Promise<SavePricingResult> {
  const [recipe] = await db
    .select({ versionId: s.recipes.currentVersionId })
    .from(s.recipes)
    .where(and(eq(s.recipes.id, recipeId), eq(s.recipes.ownerId, userId), isNull(s.recipes.deletedAt)));
  if (!recipe?.versionId) return { ok: false, reason: "not_found" };

  const invalid = (field: string): SavePricingResult => ({ ok: false, reason: "invalid", field });
  if (
    input.coefficient !== null &&
    !inRange(input.coefficient, LIMITS.coefficient.min, LIMITS.coefficient.max)
  ) {
    return invalid("coefficient");
  }
  if (input.vatRate !== null && !isVatRate(input.vatRate)) return invalid("vatRate");
  if (
    input.sellingPriceTtcCents !== null &&
    (!Number.isInteger(input.sellingPriceTtcCents) ||
      !inRange(input.sellingPriceTtcCents, 1, LIMITS.sellingPriceCents))
  ) {
    return invalid("sellingPrice");
  }
  if (
    input.laborSeconds !== null &&
    (!Number.isInteger(input.laborSeconds) || !inRange(input.laborSeconds, 0, LIMITS.seconds))
  ) {
    return invalid("labor");
  }
  const owned = new Set((await listAppliances(db, userId)).map((a) => a.id));
  const energyUses: RecipePricingView["energyUses"] = [];
  for (const use of input.energyUses) {
    if (!owned.has(use.applianceId)) return invalid("energy");
    if (!Number.isInteger(use.seconds) || !inRange(use.seconds, 0, LIMITS.seconds)) return invalid("energy");
    if (use.seconds > 0) energyUses.push({ applianceId: use.applianceId, seconds: use.seconds });
  }

  const values = {
    coefficient: input.coefficient === null ? null : input.coefficient.toFixed(4),
    vatRate: input.vatRate === null ? null : input.vatRate.toFixed(2),
    sellingPriceTtcCents: input.sellingPriceTtcCents,
    sellingPriceHtCents:
      input.sellingPriceTtcCents === null
        ? null
        : removeVat(input.sellingPriceTtcCents, input.vatRate ?? DEFAULT_VAT_RATE),
    laborSeconds: input.laborSeconds === null ? null : { prep: input.laborSeconds },
    energyUses,
  };
  await db
    .insert(s.recipePricing)
    .values({ recipeVersionId: recipe.versionId, ...values })
    .onConflictDoUpdate({
      target: s.recipePricing.recipeVersionId,
      set: { ...values, updatedAt: new Date() },
    });
  return { ok: true };
}
