import { describe, expect, it } from "vitest";
import {
  checkQuota,
  DEFAULT_QUOTAS,
  isWithinBudget,
  LIFETIME_PERIOD,
  monthlyPeriod,
  nextResetDate,
  parseQuotaOverrides,
  periodFor,
  resolveQuotaLimits,
} from "./quotas";

describe("périodes", () => {
  it("donne le mois à l'heure de Paris", () => {
    expect(monthlyPeriod(new Date("2026-10-15T12:00:00Z"))).toBe("2026-10");
    // 31 octobre 23 h 59 à Paris (UTC+1) : encore octobre
    expect(monthlyPeriod(new Date("2026-10-31T22:59:00Z"))).toBe("2026-10");
    // 1er novembre 0 h 30 à Paris : déjà novembre, même si c'est encore le 31 en UTC
    expect(monthlyPeriod(new Date("2026-10-31T23:30:00Z"))).toBe("2026-11");
    // l'été (UTC+2)
    expect(monthlyPeriod(new Date("2026-06-30T22:30:00Z"))).toBe("2026-07");
    expect(monthlyPeriod(new Date("2026-10-31T23:30:00Z"), "UTC")).toBe("2026-10");
  });

  it("choisit la période selon la métrique", () => {
    const date = new Date("2026-03-10T10:00:00Z");
    expect(periodFor("recipes", date)).toBe("2026-03");
    expect(periodFor("images", date)).toBe("2026-03");
    expect(periodFor("regenerations", date)).toBe(LIFETIME_PERIOD);
  });

  it("annonce la prochaine remise à zéro au 1er du mois suivant", () => {
    expect(nextResetDate(new Date("2026-10-06T10:00:00Z"))).toEqual({ year: 2026, month: 11, day: 1 });
    expect(nextResetDate(new Date("2026-12-31T12:00:00Z"))).toEqual({ year: 2027, month: 1, day: 1 });
  });
});

describe("limites effectives", () => {
  it("part des valeurs par défaut de la V1", () => {
    expect(resolveQuotaLimits()).toEqual({ recipes: 5, images: 10, regenerations: 2 });
    expect(DEFAULT_QUOTAS.recipes).toBe(5);
  });

  it("applique les niveaux dans l'ordre (défaut → offre → personne)", () => {
    const global = { recipes: 6 };
    const user = { recipes: 10, images: null };
    expect(resolveQuotaLimits(global, user)).toEqual({ recipes: 10, images: null, regenerations: 2 });
    expect(resolveQuotaLimits(user, global)).toEqual({ recipes: 6, images: null, regenerations: 2 });
  });

  it("ignore les valeurs invalides", () => {
    expect(resolveQuotaLimits({ recipes: -1, images: 2.5 }, null, undefined)).toEqual(DEFAULT_QUOTAS);
  });

  it("lit les exceptions stockées en JSON", () => {
    expect(parseQuotaOverrides({ recipes: 8, images: "beaucoup", autre: 3, regenerations: null })).toEqual({
      recipes: 8,
      regenerations: null,
    });
    expect(parseQuotaOverrides(null)).toEqual({});
    expect(parseQuotaOverrides([1, 2])).toEqual({});
    expect(parseQuotaOverrides("x")).toEqual({});
  });
});

describe("décision de quota", () => {
  it("autorise tant qu'il reste du quota", () => {
    expect(checkQuota(0, 5)).toEqual({ allowed: true, used: 0, limit: 5, remaining: 5 });
    expect(checkQuota(4, 5)).toMatchObject({ allowed: true, remaining: 1 });
  });

  it("refuse la 6e recette du mois", () => {
    expect(checkQuota(5, 5)).toEqual({ allowed: false, used: 5, limit: 5, remaining: 0 });
  });

  it("tient compte de la quantité demandée", () => {
    expect(checkQuota(8, 10, 2).allowed).toBe(true);
    expect(checkQuota(9, 10, 2).allowed).toBe(false);
  });

  it("ne descend jamais sous zéro si la limite a été abaissée", () => {
    expect(checkQuota(7, 5)).toMatchObject({ allowed: false, remaining: 0 });
  });

  it("gère l'illimité et une limite à zéro", () => {
    expect(checkQuota(1000, null)).toEqual({ allowed: true, used: 1000, limit: null, remaining: null });
    expect(checkQuota(0, 0).allowed).toBe(false);
  });

  it("refuse les valeurs invalides", () => {
    expect(() => checkQuota(-1, 5)).toThrow(RangeError);
    expect(() => checkQuota(0, 5, 0)).toThrow(RangeError);
    expect(() => checkQuota(1.5, 5)).toThrow(RangeError);
  });
});

describe("budget IA global", () => {
  it("compare la dépense estimée au plafond", () => {
    expect(isWithinBudget(10_000_000, 20_000_000, 100_000)).toBe(true);
    expect(isWithinBudget(19_950_000, 20_000_000, 100_000)).toBe(false);
    expect(isWithinBudget(20_000_000, 20_000_000)).toBe(true);
    expect(isWithinBudget(25_000_000, null, 1)).toBe(true);
  });
});
