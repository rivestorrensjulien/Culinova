import { describe, expect, it } from "vitest";
import { isTimedStep, mentionsDuration } from "./step-timing";

describe("durée des étapes", () => {
  it("repère une durée écrite dans la consigne", () => {
    for (const text of [
      "Cuire 9 minutes",
      "Enfourner 25 min à 180 °C",
      "Laisser reposer 1 h",
      "Pocher 30 s",
      "Cuire quelques minutes",
    ]) {
      expect(mentionsDuration(text), text).toBe(true);
    }
    for (const text of [
      "Plonger les œufs dans l'eau bouillante",
      "Écaler les œufs (200 g, 4 œufs)",
      "Ajouter 2 c. à soupe d'huile",
    ]) {
      expect(mentionsDuration(text), text).toBe(false);
    }
  });

  it("une cuisson ou un minuteur d'au moins une minute doit dire sa durée", () => {
    expect(isTimedStep({ timer: true, durationSeconds: 540 })).toBe(true);
    expect(isTimedStep({ timer: false, durationSeconds: 540, phase: "cooking" })).toBe(true);
    expect(isTimedStep({ timer: false, durationSeconds: 300, temperatureC: 180 })).toBe(true);
    expect(isTimedStep({ timer: false, durationSeconds: 120, phase: "mise_en_place" })).toBe(false);
    expect(isTimedStep({ timer: true, durationSeconds: 30 })).toBe(false);
    expect(isTimedStep({ timer: true, durationSeconds: null })).toBe(false);
  });
});
