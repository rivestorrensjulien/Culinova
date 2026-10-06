import { describe, expect, it } from "vitest";
import { bestDisplayUnit, convert, dimensionOf, fromBase, isUnit, toBase, volumeToMass } from "./units";

describe("unités", () => {
  it("convertit vers les unités internes", () => {
    expect(toBase(1.5, "kg")).toEqual({ dimension: "mass", value: 1500 });
    expect(toBase(25, "cl")).toEqual({ dimension: "volume", value: 250 });
    expect(toBase(2, "tbsp")).toEqual({ dimension: "volume", value: 30 });
    expect(toBase(3, "piece")).toEqual({ dimension: "count", value: 3 });
    expect(toBase(500, "mg").value).toBeCloseTo(0.5);
  });

  it("convertit entre unités d'une même dimension", () => {
    expect(convert(50, "cl", "l")).toBe(0.5);
    expect(convert(1, "l", "dl")).toBe(10);
    expect(convert(3, "tsp", "tbsp")).toBe(1);
    expect(fromBase({ dimension: "mass", value: 250 }, "kg")).toBe(0.25);
  });

  it("refuse les conversions entre dimensions différentes", () => {
    expect(() => convert(1, "kg", "l")).toThrow(TypeError);
  });

  it("refuse les quantités négatives ou non finies", () => {
    expect(() => toBase(-1, "g")).toThrow(RangeError);
    expect(() => toBase(Number.NaN, "g")).toThrow(RangeError);
  });

  it("convertit un volume en masse avec la densité", () => {
    expect(volumeToMass(100, 1.03)).toBeCloseTo(103);
    expect(() => volumeToMass(100, 0)).toThrow(RangeError);
  });

  it("reconnaît les unités", () => {
    expect(isUnit("kg")).toBe(true);
    expect(isUnit("tasse")).toBe(false);
    expect(isUnit("toString")).toBe(false);
    expect(dimensionOf("tbsp")).toBe("volume");
  });

  it("choisit une unité d'affichage lisible", () => {
    expect(bestDisplayUnit({ dimension: "mass", value: 1500 })).toBe("kg");
    expect(bestDisplayUnit({ dimension: "mass", value: 250 })).toBe("g");
    expect(bestDisplayUnit({ dimension: "mass", value: 0.5 })).toBe("mg");
    expect(bestDisplayUnit({ dimension: "mass", value: 0 })).toBe("g");
    expect(bestDisplayUnit({ dimension: "volume", value: 1200 })).toBe("l");
    expect(bestDisplayUnit({ dimension: "volume", value: 250 })).toBe("cl");
    expect(bestDisplayUnit({ dimension: "volume", value: 15 })).toBe("ml");
    expect(bestDisplayUnit({ dimension: "count", value: 3 })).toBe("piece");
  });
});
