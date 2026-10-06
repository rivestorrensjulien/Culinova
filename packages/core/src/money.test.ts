import { describe, expect, it } from "vitest";
import { divRound, formatCents, formatPrice, fromCents, parsePrice, toCents } from "./money";

describe("argent", () => {
  it("lit les prix en euros au format numeric(12,4)", () => {
    // 1 € = 1 000 000 dix-millièmes de centime
    expect(parsePrice("12.3456")).toBe(12_345_600n);
    expect(parsePrice("12")).toBe(12_000_000n);
    expect(parsePrice("9.8")).toBe(9_800_000n);
    expect(parsePrice("0.0042")).toBe(4_200n);
    expect(parsePrice(" 3.5 ")).toBe(3_500_000n);
    expect(parsePrice(1.5)).toBe(1_500_000n);
    expect(toCents(parsePrice("9.80"))).toBe(980);
  });

  it("refuse les prix invalides", () => {
    expect(() => parsePrice("-1")).toThrow(RangeError);
    expect(() => parsePrice("1.23456")).toThrow(RangeError);
    expect(() => parsePrice("9,80")).toThrow(RangeError);
    expect(() => parsePrice("abc")).toThrow(RangeError);
  });

  it("écrit les prix en euros au format numeric(12,4)", () => {
    expect(formatPrice(12_345_600n)).toBe("12.3456");
    expect(formatPrice(4_200n)).toBe("0.0042");
    expect(formatPrice(parsePrice("9.8"))).toBe("9.8000");
    expect(formatPrice(fromCents(980))).toBe("9.8000");
    // arrondi au dix-millième d'euro
    expect(formatPrice(4_249n)).toBe("0.0042");
    expect(formatPrice(4_250n)).toBe("0.0043");
    expect(() => formatPrice(-1n)).toThrow(RangeError);
  });

  it("arrondit au plus proche, demi vers l'extérieur", () => {
    expect(divRound(5n, 2n)).toBe(3n);
    expect(divRound(-5n, 2n)).toBe(-3n);
    expect(divRound(5n, -2n)).toBe(-3n);
    expect(divRound(4n, 3n)).toBe(1n);
    expect(divRound(0n, 7n)).toBe(0n);
    expect(() => divRound(1n, 0n)).toThrow(RangeError);
  });

  it("convertit entre montant exact et centimes", () => {
    expect(toCents(15_000n)).toBe(2);
    expect(toCents(14_999n)).toBe(1);
    expect(fromCents(250)).toBe(2_500_000n);
    expect(() => fromCents(1.5)).toThrow(RangeError);
  });

  it("affiche les montants en euros, à la française", () => {
    expect(formatCents(123_456).replace(/\s/g, " ")).toBe("1 234,56 €");
    expect(formatCents(5, "en-GB", "GBP")).toBe("£0.05");
  });
});
