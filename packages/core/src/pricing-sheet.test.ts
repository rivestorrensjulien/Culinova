import { describe, expect, it } from "vitest";
import { pricingSheet } from "./pricing-sheet";

const base = {
  materialCents: 1200,
  servings: 4,
  laborSeconds: 30 * 60,
  hourlyRateCents: 2000,
  // Four de 3 000 W pendant 20 min = 1 kWh.
  energy: [{ powerW: 3000, seconds: 20 * 60 }],
  kwhPriceCents: 25,
  coefficient: 3.5,
  vatRate: 10,
  sellingPriceTtcCents: null,
};

describe("fiche de prix", () => {
  it("additionne matière, main-d'œuvre et énergie, puis répartit par portion", () => {
    const sheet = pricingSheet(base);
    expect(sheet.batch).toEqual({ materialCents: 1200, laborCents: 1000, energyCents: 25, totalCents: 2225 });
    expect(sheet.perPortion).toEqual({
      materialCents: 300,
      laborCents: 250,
      energyCents: 6,
      totalCents: 556,
    });
    expect(sheet.laborCounted).toBe(true);
    expect(sheet.energyCounted).toBe(true);
  });

  it("conseille un prix : matière × coefficient, plus main-d'œuvre et énergie", () => {
    const { suggested } = pricingSheet(base);
    // 3,00 € × 3,5 = 10,50 € ; + 2,50 € de main-d'œuvre + 0,06 € d'énergie = 13,06 € HT.
    expect(suggested.priceExclTaxCents).toBe(1306);
    expect(suggested.priceInclTaxCents).toBe(1437);
    expect(suggested.onMaterial.grossMarginCents).toBe(1006);
    expect(suggested.foodCostRatio).toBeCloseTo(300 / 1306, 4);
    // Le prix conseillé couvre toujours le coût de revient : marge = matière × (coefficient − 1).
    expect(suggested.netMarginCents).toBe(750);
  });

  it("reste au coefficient seul tant que main-d'œuvre et énergie ne sont pas comptées", () => {
    const { suggested } = pricingSheet({ ...base, hourlyRateCents: null, kwhPriceCents: null });
    expect(suggested.priceExclTaxCents).toBe(1050);
    expect(suggested.priceInclTaxCents).toBe(1155);
    expect(suggested.onMaterial.markupRate).toBeCloseTo(0.7143, 4);
    expect(suggested.netMarginCents).toBe(750);
  });

  it("analyse un prix de vente fixé (15 € TTC à 10 %)", () => {
    const { actual } = pricingSheet({ ...base, sellingPriceTtcCents: 1500 });
    expect(actual).not.toBeNull();
    expect(actual!.priceExclTaxCents).toBe(1364);
    expect(actual!.priceInclTaxCents).toBe(1500);
    expect(actual!.onMaterial.grossMarginCents).toBe(1064);
    expect(actual!.onMaterial.coefficient).toBeCloseTo(4.5467, 4);
    expect(actual!.netMarginCents).toBe(1364 - 556);
  });

  it("ignore la main-d'œuvre et l'énergie tant que les tarifs ne sont pas renseignés", () => {
    const sheet = pricingSheet({ ...base, hourlyRateCents: null, kwhPriceCents: null });
    expect(sheet.perPortion).toEqual({ materialCents: 300, laborCents: 0, energyCents: 0, totalCents: 300 });
    expect(sheet.laborCounted).toBe(false);
    expect(sheet.energyCounted).toBe(false);
    expect(pricingSheet({ ...base, energy: [] }).energyCounted).toBe(false);
  });

  it("refuse un nombre de portions invalide", () => {
    expect(() => pricingSheet({ ...base, servings: 0 })).toThrow(RangeError);
    expect(
      pricingSheet({ ...base, materialCents: 0, hourlyRateCents: null, kwhPriceCents: null }).suggested
        .foodCostRatio,
    ).toBeNull();
  });
});
