/** Créneaux conseillés de la programmation (heure de Paris, changements d'heure compris). */
import { describe, expect, it } from "vitest";
import { carouselSlotAfter, fromParisInput, nextSlots, parisTime, toParisInput } from "./slots";

describe("créneaux de publication", () => {
  it("passe d'heure d'été à heure d'hiver sans décalage", () => {
    expect(parisTime(2026, 7, 1, 12, 0).toISOString()).toBe("2026-07-01T10:00:00.000Z");
    expect(parisTime(2026, 12, 1, 12, 0).toISOString()).toBe("2026-12-01T11:00:00.000Z");
    expect(fromParisInput("2026-10-25T10:00")?.toISOString()).toBe("2026-10-25T09:00:00.000Z");
    expect(toParisInput(new Date("2026-10-24T13:00:00Z"))).toBe("2026-10-24T15:00");
    expect(fromParisInput("demain midi")).toBeNull();
    expect(fromParisInput("2026-13-01T10:00")).toBeNull();
  });

  it("propose le prochain créneau libre du réseau", () => {
    // Samedi 24 octobre 2026, 15 h à Paris.
    const now = new Date("2026-10-24T13:00:00Z");
    const [sunday] = nextSlots("instagram", now);
    expect(sunday?.toISOString()).toBe("2026-10-25T09:00:00.000Z"); // dimanche 10 h (heure d'hiver)
    // Dimanche déjà pris : mardi 11 h 30.
    expect(nextSlots("instagram", now, [sunday!])[0]?.toISOString()).toBe("2026-10-27T10:30:00.000Z");
    expect(nextSlots("instagram", now, [], 3).map((d) => toParisInput(d))).toEqual([
      "2026-10-25T10:00",
      "2026-10-27T11:30",
      "2026-10-29T17:30",
    ]);
    // Pinterest : une épingle par jour à 21 h, dès ce soir.
    expect(toParisInput(nextSlots("pinterest", now)[0]!)).toBe("2026-10-24T21:00");
  });

  it("carrousel : quelques jours après le Reel, à midi, un jour sans Reel", () => {
    // Reel du mardi 27 octobre → vendredi 30 ; jeudi 29 → samedi 31 ; dimanche 1er novembre → mercredi 4.
    expect(toParisInput(carouselSlotAfter(new Date("2026-10-27T10:30:00Z"))!)).toBe("2026-10-30T12:00");
    expect(toParisInput(carouselSlotAfter(new Date("2026-10-29T16:30:00Z"))!)).toBe("2026-10-31T12:00");
    expect(toParisInput(carouselSlotAfter(new Date("2026-11-01T09:00:00Z"))!)).toBe("2026-11-04T12:00");
    expect(carouselSlotAfter(new Date("2026-10-28T10:00:00Z"))).toBeNull();
  });

  it("laisse au moins un quart d'heure avant le créneau", () => {
    // Mardi 27 octobre, 19 h 20 : le créneau TikTok de 19 h 30 est trop proche.
    const now = new Date("2026-10-27T18:20:00Z");
    expect(toParisInput(nextSlots("tiktok", now)[0]!)).toBe("2026-10-29T20:00");
  });
});
