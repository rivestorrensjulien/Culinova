import { describe, expect, it } from "vitest";
import { energyCostCents, laborCostCents, lineCost, materialCost, type CostLine } from "./costs";
import { parsePrice, toCents } from "./money";
import { toBase } from "./units";

const perKg = (euros: string) => ({ dimension: "mass" as const, amount: parsePrice(euros) });
const perPiece = (euros: string) => ({ dimension: "count" as const, amount: parsePrice(euros) });

describe("coût d'une ligne", () => {
  it("multiplie la quantité par le prix au kilo", () => {
    // 250 g de farine à 1,20 €/kg = 0,30 €
    expect(toCents(lineCost({ quantity: toBase(250, "g"), price: perKg("1.20") }))).toBe(30);
  });

  it("gère le prix à la pièce", () => {
    // 3 œufs à 0,35 € = 1,05 €
    expect(toCents(lineCost({ quantity: toBase(3, "piece"), price: perPiece("0.35") }))).toBe(105);
  });

  it("gère le prix au litre", () => {
    // 50 cl de crème à 4,80 €/l = 2,40 €
    const line: CostLine = {
      quantity: toBase(50, "cl"),
      price: { dimension: "volume", amount: parsePrice("4.80") },
    };
    expect(toCents(lineCost(line))).toBe(240);
  });

  it("convertit volume → masse avec la densité", () => {
    // 100 ml de lait (1,03 g/ml) à 1,10 €/kg = 103 g → 0,1133 €
    const exact = lineCost({ quantity: toBase(100, "ml"), price: perKg("1.10"), densityGramsPerMl: 1.03 });
    expect(exact).toBe(113_300n);
    expect(toCents(exact)).toBe(11);
  });

  it("convertit masse → volume avec la densité", () => {
    // 206 g de lait (1,03 g/ml) = 200 ml, à 1,00 €/l = 0,20 €
    const line: CostLine = {
      quantity: toBase(206, "g"),
      price: { dimension: "volume", amount: parsePrice("1.00") },
      densityGramsPerMl: 1.03,
    };
    expect(toCents(lineCost(line))).toBe(20);
  });

  it("refuse des dimensions incompatibles sans densité", () => {
    expect(() => lineCost({ quantity: toBase(100, "ml"), price: perKg("1.10") })).toThrow(
      /densité manquante/,
    );
    expect(() =>
      lineCost({ quantity: toBase(2, "piece"), price: perKg("1.10"), densityGramsPerMl: 1 }),
    ).toThrow(TypeError);
    expect(() => lineCost({ quantity: toBase(150, "g"), price: perPiece("0.30") })).toThrow(
      /poids à la pièce manquant/,
    );
  });

  it("convertit grammes → pièces avec le poids moyen d'une pièce", () => {
    // 150 g d'œufs (50 g pièce) = 3 œufs à 0,30 € = 0,90 €
    expect(
      toCents(lineCost({ quantity: toBase(150, "g"), price: perPiece("0.30"), pieceWeightGrams: 50 })),
    ).toBe(90);
    // 225 g = 4,5 œufs = 1,35 €
    expect(
      toCents(lineCost({ quantity: toBase(225, "g"), price: perPiece("0.30"), pieceWeightGrams: 50 })),
    ).toBe(135);
  });

  it("convertit pièces → grammes avec le poids moyen d'une pièce", () => {
    // 2 citrons de 120 g à 3,00 €/kg = 240 g = 0,72 €
    expect(
      toCents(lineCost({ quantity: toBase(2, "piece"), price: perKg("3.00"), pieceWeightGrams: 120 })),
    ).toBe(72);
  });
});

describe("coût matière d'une recette", () => {
  const lines: CostLine[] = [
    { quantity: toBase(250, "g"), price: perKg("1.20") }, // 30 c
    { quantity: toBase(3, "piece"), price: perPiece("0.35") }, // 105 c
    { quantity: toBase(125, "g"), price: perKg("9.80") }, // 122,5 c
  ];

  it("additionne les lignes et calcule le coût par portion", () => {
    expect(materialCost(lines, 4)).toEqual({ totalCents: 258, perPortionCents: 64, perKgCents: null });
  });

  it("calcule le coût au kilo si le poids final est connu", () => {
    expect(materialCost(lines, 4, 500).perKgCents).toBe(515);
  });

  it("n'arrondit qu'à la fin (pas d'erreur cumulée)", () => {
    // 3 × 0,6 centime = 1,8 → 2 centimes (et non 1 + 1 + 1 = 3)
    const small: CostLine = { quantity: toBase(6, "g"), price: perKg("1.00") };
    expect(materialCost([small, small, small], 1).totalCents).toBe(2);
  });

  it("vaut zéro sans ingrédient", () => {
    expect(materialCost([], 2)).toEqual({ totalCents: 0, perPortionCents: 0, perKgCents: null });
  });

  it("refuse un nombre de portions invalide", () => {
    expect(() => materialCost(lines, 0)).toThrow(RangeError);
    expect(() => materialCost(lines, 2.5)).toThrow(RangeError);
  });
});

describe("main-d'œuvre et énergie", () => {
  it("calcule la main-d'œuvre", () => {
    // 30 min à 15 €/h = 7,50 €
    expect(laborCostCents(1800, 1500)).toBe(750);
    expect(laborCostCents(0, 1500)).toBe(0);
    expect(() => laborCostCents(-1, 1500)).toThrow(RangeError);
  });

  it("calcule l'énergie", () => {
    // Four 2 500 W pendant 45 min = 1,875 kWh × 0,25 € = 0,46875 € → 47 c
    expect(energyCostCents(2500, 2700, 25)).toBe(47);
    expect(() => energyCostCents(-1, 10, 25)).toThrow(RangeError);
  });
});
