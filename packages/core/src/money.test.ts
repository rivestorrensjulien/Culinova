import { describe, expect, it } from "vitest";
import { divRound, formatCents, formatPrice, fromCents, parsePrice, toCents } from "./money";

describe("argent", () => {
  it("lit les prix numeric(12,4)", () => {
    expect(parsePrice("1234.5678")).toBe(12_345_678n);
    expect(parsePrice("12")).toBe(120_000n);
    expect(parsePrice("0.0042")).toBe(42n);
    expect(parsePrice(" 3.5 ")).toBe(35_000n);
    expect(parsePrice(1.5)).toBe(15_000n);
  });

  it("refuse les prix invalides", () => {
    expect(() => parsePrice("-1")).toThrow(RangeError);
    expect(() => parsePrice("1.23456")).toThrow(RangeError);
    expect(() => parsePrice("abc")).toThrow(RangeError);
  });

  it("écrit les prix au format numeric(12,4)", () => {
    expect(formatPrice(12_345_678n)).toBe("1234.5678");
    expect(formatPrice(42n)).toBe("0.0042");
    expect(formatPrice(parsePrice("980"))).toBe("980.0000");
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
