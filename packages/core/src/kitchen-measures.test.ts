import { describe, expect, it } from "vitest";
import { agreeKitchenUnit, estimateKitchenMeasure } from "./kitchen-measures";

const m = (name: string, grams: number, uses?: "recipe" | "shopping") =>
  estimateKitchenMeasure(name, grams, { uses });

describe("mesures de cuisine déduites du poids", () => {
  it("compte ce qui se compte", () => {
    expect(m("Œufs", 225)).toEqual({ value: 4.5, unit: "œufs" });
    expect(m("Oeuf", 50)).toEqual({ value: 1, unit: "œuf" });
    expect(m("Jaunes d'œufs", 60)).toEqual({ value: 3, unit: "jaunes" });
    expect(m("Blancs d'œufs", 90)).toEqual({ value: 3, unit: "blancs" });
    expect(m("Ail", 10)).toEqual({ value: 2, unit: "gousses" });
    expect(m("Oignons jaunes", 300)).toEqual({ value: 2, unit: "oignons" });
    expect(m("Pommes de terre", 600)).toEqual({ value: 4, unit: "pommes de terre" });
    expect(m("Citron vert", 140)).toEqual({ value: 2, unit: "citrons verts" });
    expect(m("Feuilles de gélatine", 6)).toEqual({ value: 3, unit: "feuilles" });
  });

  it("ne confond pas la pièce et ce qu'on en tire", () => {
    expect(m("Jus de citron", 30)).toEqual({ value: 2, unit: "c. à soupe" });
    expect(m("Zeste de citron", 2)).toBeNull();
    expect(m("Blanc de poulet", 300)).toBeNull();
    expect(m("Compote de pommes", 200)).toBeNull();
    expect(m("Ail en poudre", 2)).toEqual({ value: 1, unit: "c. à café" });
    expect(m("Sucre en poudre", 24)).toEqual({ value: 2, unit: "c. à soupe" });
    expect(m("Tomates séchées", 50)).toBeNull();
  });

  it("cuillères pour les petites quantités, centilitres pour les liquides", () => {
    expect(m("Sel fin", 0.5)).toEqual({ value: 1, unit: "pincée" });
    expect(m("Sel", 6)).toEqual({ value: 1, unit: "c. à café" });
    expect(m("Farine", 16)).toEqual({ value: 2, unit: "c. à soupe" });
    expect(m("Farine", 250)).toBeNull();
    expect(m("Huile d'olive", 28)).toEqual({ value: 2, unit: "c. à soupe" });
    expect(m("Lait entier", 250)).toEqual({ value: 25, unit: "cl" });
    expect(m("Crème liquide", 200)).toEqual({ value: 20, unit: "cl" });
    expect(m("Eau", 1500)).toEqual({ value: 1.5, unit: "l" });
    expect(m("Cumin", 1)).toEqual({ value: 0.5, unit: "c. à café" });
    expect(m("Poivre", 0.3)).toEqual({ value: 1, unit: "pincée" });
    expect(m("Saumon", 300)).toBeNull();
  });

  it("pour les courses : pièces et liquides seulement", () => {
    expect(m("Œufs", 300, "shopping")).toEqual({ value: 6, unit: "œufs" });
    expect(m("Lait", 500, "shopping")).toEqual({ value: 50, unit: "cl" });
    expect(m("Sucre", 30, "shopping")).toBeNull();
    expect(m("Huile", 20, "shopping")).toBeNull();
  });

  it("en anglais", () => {
    expect(estimateKitchenMeasure("Eggs", 100, { lang: "en" })).toEqual({ value: 2, unit: "eggs" });
    expect(estimateKitchenMeasure("Salt", 0.5, { lang: "en" })).toEqual({ value: 1, unit: "pinch" });
  });
});

describe("accord de l'unité", () => {
  it("français : singulier sous 2", () => {
    expect(agreeKitchenUnit(1, "œufs")).toBe("œuf");
    expect(agreeKitchenUnit(1.5, "œufs")).toBe("œuf");
    expect(agreeKitchenUnit(4.5, "œufs")).toBe("œufs");
    expect(agreeKitchenUnit(3, "pincée")).toBe("pincées");
    expect(agreeKitchenUnit(2, "gousse")).toBe("gousses");
    expect(agreeKitchenUnit(1, "citrons verts")).toBe("citron vert");
    expect(agreeKitchenUnit(3, "citron vert")).toBe("citrons verts");
    expect(agreeKitchenUnit(1, "tranches de pain")).toBe("tranche de pain");
    expect(agreeKitchenUnit(2, "tranche de pain")).toBe("tranches de pain");
    expect(agreeKitchenUnit(1, "poireaux")).toBe("poireau");
    expect(agreeKitchenUnit(2, "poireau")).toBe("poireaux");
    expect(agreeKitchenUnit(1, "oignons nouveaux")).toBe("oignon nouveau");
  });
  it("unités invariables", () => {
    expect(agreeKitchenUnit(3, "c. à soupe")).toBe("c. à soupe");
    expect(agreeKitchenUnit(1, "cl")).toBe("cl");
    expect(agreeKitchenUnit(2, "tbsp")).toBe("tbsp");
  });
  it("anglais", () => {
    expect(agreeKitchenUnit(1, "eggs")).toBe("egg");
    expect(agreeKitchenUnit(2, "pinch")).toBe("pinches");
    expect(agreeKitchenUnit(1.5, "eggs")).toBe("eggs");
  });
});
