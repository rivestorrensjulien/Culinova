import { describe, expect, it } from "vitest";
import { scaleFactor, scaleQuantity } from "./portions";

describe("portions", () => {
  it("calcule le facteur", () => {
    expect(scaleFactor(4, 6)).toBe(1.5);
    expect(() => scaleFactor(0, 4)).toThrow(RangeError);
    expect(() => scaleFactor(4, 2.5)).toThrow(RangeError);
  });

  it("recalcule masses et volumes sans arrondi", () => {
    expect(scaleQuantity({ dimension: "mass", value: 250 }, 4, 6)).toEqual({ dimension: "mass", value: 375 });
    expect(scaleQuantity({ dimension: "volume", value: 100 }, 4, 2)).toEqual({
      dimension: "volume",
      value: 50,
    });
  });

  it("arrondit les pièces au demi, sans tomber à zéro", () => {
    expect(scaleQuantity({ dimension: "count", value: 3 }, 4, 6).value).toBe(4.5);
    expect(scaleQuantity({ dimension: "count", value: 3 }, 4, 10).value).toBe(7.5);
    expect(scaleQuantity({ dimension: "count", value: 1 }, 4, 2).value).toBe(0.5);
    expect(scaleQuantity({ dimension: "count", value: 1 }, 20, 2).value).toBe(0.5);
  });
});
