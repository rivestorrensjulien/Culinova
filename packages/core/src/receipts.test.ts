import { describe, expect, it } from "vitest";
import { median, pricePerReferenceUnit, receiptLabelKey, storeKey } from "./receipts";

describe("tickets de caisse", () => {
  it("prix au kilo, au litre ou à la pièce d'une ligne", () => {
    expect(pricePerReferenceUnit({ quantity: 250, unit: "g", totalPrice: 2.45 }, "kg")).toBe(9.8);
    expect(pricePerReferenceUnit({ quantity: 0.452, unit: "kg", totalPrice: 1.8 }, "kg")).toBe(3.98);
    expect(pricePerReferenceUnit({ quantity: 6, unit: "l", totalPrice: 5.94 }, "l")).toBe(0.99);
    expect(pricePerReferenceUnit({ quantity: 20, unit: "cl", totalPrice: 1.2 }, "l")).toBe(6);
    expect(pricePerReferenceUnit({ quantity: 12, unit: "piece", totalPrice: 3.6 }, "piece")).toBe(0.3);
  });
  it("refuse les unités qui ne vont pas ensemble ou les valeurs absentes", () => {
    expect(pricePerReferenceUnit({ quantity: 250, unit: "g", totalPrice: 2 }, "piece")).toBeNull();
    expect(pricePerReferenceUnit({ quantity: null, unit: "g", totalPrice: 2 }, "kg")).toBeNull();
    expect(pricePerReferenceUnit({ quantity: 1, unit: "kg", totalPrice: 0 }, "kg")).toBeNull();
    expect(pricePerReferenceUnit({ quantity: 1, unit: "boite", totalPrice: 2 }, "kg")).toBeNull();
  });
  it("compare les libellés sans accents ni casse", () => {
    expect(receiptLabelKey("Beur dx  Président 250g")).toBe("BEUR DX PRESIDENT 250G");
    expect(receiptLabelKey("BEUR DX PRESIDENT 250G")).toBe("BEUR DX PRESIDENT 250G");
    expect(storeKey(null)).toBe("");
    expect(storeKey("E.Leclerc")).toBe("E.LECLERC");
  });
  it("médiane", () => {
    expect(median([])).toBeNull();
    expect(median([3, 1, 2])).toBe(2);
    expect(median([10, 2, 3, 100])).toBe(6.5);
  });
});
