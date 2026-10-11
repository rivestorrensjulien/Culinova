import { FakeLlmAdapter } from "@culinova/ai";
import { pricingSheet } from "@culinova/core";
import * as s from "@culinova/db/schema";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { readDecimal, readEurosToCents } from "@/lib/decimal";
import { emptyWizardState, type WizardState } from "@/lib/wizard";
import { createTestUser, hasTestDb, testDb } from "@/test/db";
import { runGeneration } from "../generation/run";
import { startRecipeGeneration } from "../generation/start";
import { loadRecipeView } from "../generation/view";
import {
  addAppliance,
  addCommonAppliances,
  getCostingSettings,
  listAppliances,
  removeAppliance,
  saveCostingSettings,
  saveRecipePricing,
} from "./pricing";
import { savePrice } from "./prices";

const state: WizardState = {
  ...emptyWizardState("fr"),
  step: 9,
  momentCode: "main",
  influenceCode: "asia",
  regionCode: "east_asia",
  countryIso: "JP",
  cuisineCodes: ["japanese"],
  styleCode: "creative",
  mode: "idea",
  input: "Un plat de saumon",
  servings: 4,
};

async function recipeFor(userId: string) {
  const db = testDb();
  const [draft] = await db.insert(s.recipeDrafts).values({ userId, state, wizardStep: 9 }).returning();
  const started = await startRecipeGeneration(db, { userId, draftId: draft!.id });
  if (!started.ok) throw new Error(started.reason);
  await runGeneration(db, new FakeLlmAdapter(), started.generationId);
  const [row] = await db.select().from(s.recipeDrafts).where(eq(s.recipeDrafts.id, draft!.id));
  return (await loadRecipeView(db, row!.recipeId!, userId))!;
}

describe("saisie des montants", () => {
  it("accepte la virgule et convertit les euros en centimes", () => {
    expect(readDecimal("3,5")).toBe(3.5);
    expect(readDecimal(" 12 ")).toBe(12);
    expect(readDecimal("-1")).toBeNull();
    expect(readDecimal("abc")).toBeNull();
    expect(readEurosToCents("14,90")).toBe(1490);
    expect(readEurosToCents("0,2516")).toBe(25);
  });
});

describe.skipIf(!hasTestDb)("réglages de chiffrage et prix de vente", () => {
  it("garde des valeurs par défaut, puis enregistre les réglages du compte", async () => {
    const db = testDb();
    const user = await createTestUser();
    expect(await getCostingSettings(db, user.id)).toEqual({
      coefficient: 3.5,
      vatRate: 10,
      hourlyRateCents: null,
      kwhPriceCents: null,
    });
    const saved = await saveCostingSettings(db, user.id, {
      coefficient: 3.2,
      vatRate: 5.5,
      hourlyRateCents: 2000,
      kwhPriceCents: 25,
    });
    expect(saved).toEqual({
      ok: true,
      settings: { coefficient: 3.2, vatRate: 5.5, hourlyRateCents: 2000, kwhPriceCents: 25 },
    });
    expect(
      await saveCostingSettings(db, user.id, {
        coefficient: 3,
        vatRate: 7,
        hourlyRateCents: null,
        kwhPriceCents: null,
      }),
    ).toEqual({ ok: false, field: "vatRate" });
    expect(
      await saveCostingSettings(db, user.id, {
        coefficient: 0,
        vatRate: 10,
        hourlyRateCents: null,
        kwhPriceCents: null,
      }),
    ).toEqual({ ok: false, field: "coefficient" });
  });

  it("gère les appareils de chaque personne séparément", async () => {
    const db = testDb();
    const user = await createTestUser();
    const other = await createTestUser();
    const oven = await addAppliance(db, user.id, { name: " Four mixte ", powerW: 3500 });
    expect(oven).toMatchObject({ name: "Four mixte", powerW: 3500 });
    expect(await addAppliance(db, user.id, { name: "Plaque", powerW: 0 })).toBeNull();
    expect(await addAppliance(db, user.id, { name: "  ", powerW: 1000 })).toBeNull();

    const list = await addCommonAppliances(db, user.id);
    expect(list.map((a) => a.name)).toContain("Four");
    // Ajouter les appareils courants deux fois ne crée pas de doublons.
    expect((await addCommonAppliances(db, user.id)).length).toBe(list.length);

    expect(await listAppliances(db, other.id)).toEqual([]);
    expect(await removeAppliance(db, other.id, oven!.id)).toBe(false);
    expect(await removeAppliance(db, user.id, oven!.id)).toBe(true);
  });

  it("enregistre les paramètres de prix d'une recette et calcule les marges", async () => {
    const db = testDb();
    const user = await createTestUser();
    const other = await createTestUser();
    const recipe = await recipeFor(user.id);
    expect(recipe.pricing.pricing).toBeNull();

    // 300 g de riz à 4 €/kg = 1,20 € pour 4 personnes.
    const rice = recipe.ingredients.find((i) => i.label === "Riz à sushi")!;
    const [line] = await db
      .select({ ingredientId: s.recipeIngredients.ingredientId })
      .from(s.recipeIngredients)
      .where(eq(s.recipeIngredients.id, rice.id));
    await savePrice(db, {
      userId: user.id,
      ingredientId: line!.ingredientId!,
      price: "4",
      supplierName: null,
    });
    await saveCostingSettings(db, user.id, {
      coefficient: 3.5,
      vatRate: 10,
      hourlyRateCents: 2000,
      kwhPriceCents: 25,
    });
    const oven = (await addAppliance(db, user.id, { name: "Four", powerW: 3000 }))!;

    const input = {
      coefficient: 4,
      vatRate: 10,
      sellingPriceTtcCents: 1500,
      laborSeconds: 30 * 60,
      energyUses: [{ applianceId: oven.id, seconds: 20 * 60 }],
    };
    expect(await saveRecipePricing(db, other.id, recipe.recipeId, input)).toEqual({
      ok: false,
      reason: "not_found",
    });
    expect(
      await saveRecipePricing(db, user.id, recipe.recipeId, {
        ...input,
        energyUses: [
          { applianceId: (await addAppliance(db, other.id, { name: "X", powerW: 10 }))!.id, seconds: 60 },
        ],
      }),
    ).toMatchObject({ ok: false, field: "energy" });
    expect(await saveRecipePricing(db, user.id, recipe.recipeId, input)).toEqual({ ok: true });

    const view = (await loadRecipeView(db, recipe.recipeId, user.id))!;
    expect(view.pricing.pricing).toEqual(input);
    expect(view.pricing.appliances.map((a) => a.id)).toEqual([oven.id]);

    const sheet = pricingSheet({
      materialCents: view.cost.totalCents,
      servings: view.servings,
      laborSeconds: view.pricing.pricing!.laborSeconds!,
      hourlyRateCents: view.pricing.settings.hourlyRateCents,
      energy: [{ powerW: 3000, seconds: 20 * 60 }],
      kwhPriceCents: view.pricing.settings.kwhPriceCents,
      coefficient: view.pricing.pricing!.coefficient!,
      vatRate: view.pricing.pricing!.vatRate!,
      sellingPriceTtcCents: view.pricing.pricing!.sellingPriceTtcCents,
    });
    expect(sheet.perPortion).toEqual({ materialCents: 30, laborCents: 250, energyCents: 6, totalCents: 286 });
    expect(sheet.suggested.priceExclTaxCents).toBe(120);
    expect(sheet.actual).toMatchObject({ priceExclTaxCents: 1364, priceInclTaxCents: 1500 });
  });
});
