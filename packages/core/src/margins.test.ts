import { describe, expect, it } from "vitest";
import { addVat, analyzeMargin, priceFromCoefficient, removeVat, suggestPrice } from "./margins";

describe("prix de vente", () => {
  it("applique le coefficient multiplicateur", () => {
    expect(priceFromCoefficient(258, 3.5)).toBe(903);
    expect(priceFromCoefficient(100, 0)).toBe(0);
    expect(() => priceFromCoefficient(100, -1)).toThrow(RangeError);
    expect(() => priceFromCoefficient(1.5, 2)).toThrow(RangeError);
  });

  it("ajoute la TVA", () => {
    expect(addVat(1000, 10)).toBe(1100);
    expect(addVat(1000, 5.5)).toBe(1055);
    expect(addVat(999, 20)).toBe(1199);
    expect(addVat(1000, 0)).toBe(1000);
  });

  it("retire la TVA", () => {
    expect(removeVat(1100, 10)).toBe(1000);
    expect(removeVat(1199, 20)).toBe(999);
    expect(removeVat(1055, 5.5)).toBe(1000);
  });
});

describe("analyse de marge", () => {
  it("calcule marge brute, taux de marge, taux de marque et coefficient", () => {
    const m = analyzeMargin(300, 1000);
    expect(m.grossMarginCents).toBe(700);
    expect(m.marginRate).toBeCloseTo(2.3333, 4);
    expect(m.markupRate).toBeCloseTo(0.7);
    expect(m.coefficient).toBeCloseTo(3.3333, 4);
  });

  it("gère les cas limites", () => {
    expect(analyzeMargin(0, 500)).toEqual({
      grossMarginCents: 500,
      marginRate: null,
      markupRate: 1,
      coefficient: null,
    });
    expect(analyzeMargin(500, 0).markupRate).toBeNull();
    expect(analyzeMargin(500, 400).grossMarginCents).toBe(-100);
  });

  it("propose un prix HT et TTC", () => {
    const s = suggestPrice(258, 3.5, 10);
    expect(s.priceExclTaxCents).toBe(903);
    expect(s.priceInclTaxCents).toBe(993);
    expect(s.margin.grossMarginCents).toBe(645);
  });
});
