"use server";

import { getLocale } from "next-intl/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { readDecimal, readEurosToCents } from "@/lib/decimal";
import { audit } from "../audit";
import {
  addAppliance,
  addCommonAppliances,
  type ApplianceView,
  type CostingSettingsView,
  removeAppliance,
  type SavePricingResult,
  type SaveSettingsResult,
  saveCostingSettings,
  saveRecipePricing,
} from "../costing/pricing";
import { getDb } from "../db";
import { requireUser } from "../session";

const uuid = z.uuid();

async function currentUser() {
  return requireUser(await getLocale());
}

/** Saisie du formulaire de réglages (montants en euros, virgule acceptée). */
export interface SettingsInput {
  coefficient: string;
  vatRate: number;
  hourlyRate: string;
  kwhPrice: string;
}

export async function saveCostingSettingsAction(input: SettingsInput): Promise<SaveSettingsResult> {
  const session = await currentUser();
  const coefficient = readDecimal(input.coefficient);
  if (coefficient === null) return { ok: false, field: "coefficient" };
  const optionalCents = (value: string) =>
    String(value ?? "").trim() === "" ? null : readEurosToCents(value);
  const hourlyRateCents = optionalCents(input.hourlyRate);
  if (hourlyRateCents === null && String(input.hourlyRate ?? "").trim() !== "") {
    return { ok: false, field: "hourlyRate" };
  }
  const kwhPriceCents = optionalCents(input.kwhPrice);
  if (kwhPriceCents === null && String(input.kwhPrice ?? "").trim() !== "") {
    return { ok: false, field: "kwhPrice" };
  }
  const settings: CostingSettingsView = {
    coefficient,
    vatRate: Number(input.vatRate),
    hourlyRateCents,
    kwhPriceCents,
  };
  const db = getDb();
  const result = await saveCostingSettings(db, session.user.id, settings);
  if (result.ok) {
    await audit(db, {
      actorId: session.user.id,
      action: "settings.costing.set",
      entity: "costing_settings",
      entityId: session.user.id,
      after: result.settings,
    });
    revalidatePath("/app", "layout");
  }
  return result;
}

export async function addApplianceAction(name: string, power: string): Promise<ApplianceView | null> {
  const session = await currentUser();
  const powerW = readDecimal(power);
  if (powerW === null) return null;
  const appliance = await addAppliance(getDb(), session.user.id, {
    name: String(name ?? ""),
    powerW: Math.round(powerW),
  });
  if (appliance) revalidatePath("/app", "layout");
  return appliance;
}

export async function addCommonAppliancesAction(): Promise<ApplianceView[]> {
  const session = await currentUser();
  const list = await addCommonAppliances(getDb(), session.user.id);
  revalidatePath("/app", "layout");
  return list;
}

export async function removeApplianceAction(applianceId: string): Promise<boolean> {
  const session = await currentUser();
  if (!uuid.safeParse(applianceId).success) return false;
  const ok = await removeAppliance(getDb(), session.user.id, applianceId);
  if (ok) revalidatePath("/app", "layout");
  return ok;
}

/** Saisie de la fiche de prix d'une recette (prix de vente TTC d'une portion, durées en minutes). */
export interface RecipePricingInput {
  coefficient: string;
  vatRate: number;
  sellingPriceTtc: string;
  laborMinutes: string;
  energy: Array<{ applianceId: string; minutes: string }>;
}

const blank = (value: string | null | undefined) => String(value ?? "").trim() === "";

export async function saveRecipePricingAction(
  recipeId: string,
  input: RecipePricingInput,
): Promise<SavePricingResult> {
  const session = await currentUser();
  if (!uuid.safeParse(recipeId).success) return { ok: false, reason: "not_found" };
  const invalid = (field: string): SavePricingResult => ({ ok: false, reason: "invalid", field });

  const coefficient = readDecimal(input.coefficient);
  if (coefficient === null) return invalid("coefficient");
  const vatRate = Number(input.vatRate);

  let sellingPriceTtcCents: number | null = null;
  if (!blank(input.sellingPriceTtc)) {
    sellingPriceTtcCents = readEurosToCents(input.sellingPriceTtc);
    if (sellingPriceTtcCents === null || sellingPriceTtcCents <= 0) return invalid("sellingPrice");
  }

  let laborSeconds: number | null = null;
  if (!blank(input.laborMinutes)) {
    const minutes = readDecimal(input.laborMinutes);
    if (minutes === null) return invalid("labor");
    laborSeconds = Math.round(minutes * 60);
  }

  const energyUses: Array<{ applianceId: string; seconds: number }> = [];
  for (const use of (input.energy ?? []).slice(0, 50)) {
    if (blank(use.minutes)) continue;
    const minutes = readDecimal(use.minutes);
    if (minutes === null || !uuid.safeParse(use.applianceId).success) return invalid("energy");
    energyUses.push({ applianceId: use.applianceId, seconds: Math.round(minutes * 60) });
  }

  const db = getDb();
  const result = await saveRecipePricing(db, session.user.id, recipeId, {
    coefficient,
    vatRate,
    sellingPriceTtcCents,
    laborSeconds,
    energyUses,
  });
  if (result.ok) {
    await audit(db, {
      actorId: session.user.id,
      action: "recipe.pricing.set",
      entity: "recipe",
      entityId: recipeId,
      after: { coefficient, vatRate, sellingPriceTtcCents, laborSeconds, energyUses },
    });
  }
  return result;
}
