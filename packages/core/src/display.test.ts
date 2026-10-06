import { describe, expect, it } from "vitest";
import { toDisplayQuantity } from "./display";

describe("quantités affichées", () => {
  it("choisit une unité lisible et arrondit raisonnablement", () => {
    expect(toDisplayQuantity({ dimension: "mass", value: 1500 })).toEqual({ value: 1.5, unit: "kg" });
    expect(toDisplayQuantity({ dimension: "mass", value: 333.33 })).toEqual({ value: 335, unit: "g" });
    expect(toDisplayQuantity({ dimension: "mass", value: 42.6 })).toEqual({ value: 43, unit: "g" });
    expect(toDisplayQuantity({ dimension: "mass", value: 2.25 })).toEqual({ value: 2.3, unit: "g" });
    expect(toDisplayQuantity({ dimension: "mass", value: 0.4 })).toEqual({ value: 400, unit: "mg" });
    expect(toDisplayQuantity({ dimension: "volume", value: 250 })).toEqual({ value: 25, unit: "cl" });
    expect(toDisplayQuantity({ dimension: "volume", value: 1234 })).toEqual({ value: 1.23, unit: "l" });
    expect(toDisplayQuantity({ dimension: "volume", value: 15 })).toEqual({ value: 15, unit: "ml" });
    expect(toDisplayQuantity({ dimension: "count", value: 2.4 })).toEqual({ value: 2.5, unit: "piece" });
  });
});
