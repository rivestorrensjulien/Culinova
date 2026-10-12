import { describe, expect, it } from "vitest";
import { microsToInput, overridesFrom, readLimit, readQuotaForm, readUsdToMicros } from "./admin-forms";

function form(values: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
}

describe("formulaires d'administration", () => {
  it("lit une limite : vide = sans valeur, entier positif sinon", () => {
    expect(readLimit("")).toEqual({ ok: true, value: null });
    expect(readLimit(" 12 ")).toEqual({ ok: true, value: 12 });
    expect(readLimit("0")).toEqual({ ok: true, value: 0 });
    expect(readLimit("-1").ok).toBe(false);
    expect(readLimit("2,5").ok).toBe(false);
    expect(readLimit("20000").ok).toBe(false);
    expect(readLimit(null)).toEqual({ ok: true, value: null });
  });

  it("lit les trois quotas et signale le champ invalide", () => {
    expect(readQuotaForm(form({ recipes: "8", images: "", regenerations: "3" }))).toEqual({
      ok: true,
      value: { recipes: 8, images: null, regenerations: 3 },
    });
    expect(readQuotaForm(form({ recipes: "8", images: "abc", regenerations: "3" }))).toEqual({
      ok: false,
      field: "images",
    });
  });

  it("ne garde que les exceptions renseignées", () => {
    expect(overridesFrom({ recipes: 20, images: null, regenerations: 0 })).toEqual({
      recipes: 20,
      regenerations: 0,
    });
  });

  it("convertit le plafond en dollars en micro-dollars", () => {
    expect(readUsdToMicros("50")).toEqual({ ok: true, value: 50_000_000 });
    expect(readUsdToMicros("12,5")).toEqual({ ok: true, value: 12_500_000 });
    expect(readUsdToMicros("")).toEqual({ ok: true, value: null });
    expect(readUsdToMicros("1,234").ok).toBe(false);
    expect(microsToInput(12_500_000)).toBe("12,5");
    expect(microsToInput(null)).toBe("");
  });
});
