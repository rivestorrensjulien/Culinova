import { describe, expect, it } from "vitest";
import { per100gOf, recipeNutrition, roundNutrient } from "./nutrition";

const rice = {
  kcal: 350,
  kj: 1480,
  protein: 7,
  carbs: 77.5,
  sugars: 0.1,
  fiber: 1.5,
  fat: 0.8,
  saturated: 0.2,
};
const salmon = { kcal: 200, protein: 20, fat: 13, saturated: 2.5, salt: 0.15 };

describe("valeurs nutritionnelles", () => {
  it("additionne les apports au poids et les répartit par portion", () => {
    const result = recipeNutrition(
      [
        { grams: 300, per100g: rice },
        { grams: 480, per100g: salmon },
      ],
      4,
    );
    // Énergie : 300 g × 350 + 480 g × 200 = 1 050 + 960 = 2 010 kcal, soit 502,5 par portion.
    expect(result.total.kcal).toBe(2010);
    expect(result.perPortion.kcal).toBe(503);
    expect(result.perPortion.protein).toBe(29.3);
    expect(result.totalGrams).toBe(780);
    expect(result.per100g.kcal).toBe(258);
    // kJ manquant pour le saumon : déduit des kcal (960 × 4,184 = 4 016,6) ; riz : 4 440.
    expect(result.total.kj).toBe(8457);
    expect(result.perPortion.salt).toBe(0.18);
  });

  it("ignore les poids nuls et refuse un nombre de portions invalide", () => {
    expect(recipeNutrition([{ grams: 0, per100g: rice }], 2).total.kcal).toBe(0);
    expect(() => recipeNutrition([], 0)).toThrow(RangeError);
  });

  it("donne les valeurs pour 100 g d'une préparation d'après son poids final", () => {
    const total = recipeNutrition([{ grams: 200, per100g: rice }], 1).total;
    expect(per100gOf(total, 400).kcal).toBe(175);
    expect(per100gOf(total, 0)).toEqual({});
    expect(roundNutrient("salt", 0.12345)).toBe(0.12);
  });
});
