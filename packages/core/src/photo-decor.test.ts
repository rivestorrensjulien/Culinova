import { describe, expect, it } from "vitest";
import {
  decorPrompt,
  decorTone,
  parseDecor,
  PHOTO_BACKGROUNDS,
  type PhotoDecor,
  pickPhotoDecor,
} from "./photo-decor";

/** Hasard reproductible. */
function seeded(seed: number): () => number {
  let x = seed;
  return () => {
    x = (x * 1103515245 + 12345) % 2147483648;
    return x / 2147483648;
  };
}

describe("décor des photos (plaquette du 28/11)", () => {
  it("ne répète jamais le fond ni le contenant des 3 dernières photos", () => {
    const random = seeded(7);
    const history: PhotoDecor[] = [];
    for (let i = 0; i < 60; i++) {
      const decor = pickPhotoDecor(history, random);
      const last3 = history.slice(0, 3);
      expect(last3.map((d) => d.background)).not.toContain(decor.background);
      expect(last3.map((d) => d.container)).not.toContain(decor.container);
      expect(history.slice(0, 2).map((d) => d.mood)).not.toContain(decor.mood);
      expect(history.slice(0, 2).map((d) => d.angle)).not.toContain(decor.angle);
      history.unshift(decor);
    }
  });

  it("sur 3 photos d'affilée : au moins une claire, au plus une sombre", () => {
    const random = seeded(42);
    const history: PhotoDecor[] = [];
    for (let i = 0; i < 80; i++) history.unshift(pickPhotoDecor(history, random));
    for (let i = 0; i + 3 <= history.length; i++) {
      const tones = history.slice(i, i + 3).map(decorTone);
      expect(tones).toContain("clair");
      expect(tones.filter((t) => t === "sombre").length).toBeLessThanOrEqual(1);
    }
  });

  it("utilise tous les fonds, pas seulement le bois sombre", () => {
    const random = seeded(3);
    const history: PhotoDecor[] = [];
    for (let i = 0; i < 80; i++) history.unshift(pickPhotoDecor(history, random));
    const used = new Set(history.map((d) => d.background));
    expect(used.size).toBe(PHOTO_BACKGROUNDS.length);
  });

  it("ton : le plus sombre du fond et de la lumière", () => {
    expect(decorTone({ background: "marbre", container: "ardoise", mood: "studio", angle: "dessus" })).toBe(
      "clair",
    );
    expect(
      decorTone({ background: "marbre", container: "ardoise", mood: "fin-de-journee", angle: "dessus" }),
    ).toBe("sombre");
    expect(decorTone({ background: "zellige", container: "ardoise", mood: "matin", angle: "dessus" })).toBe(
      "moyen",
    );
  });

  it("relit un décor enregistré et ignore le reste", () => {
    const decor = { background: "lin", container: "gres-bleu", mood: "matin", angle: "gros-plan" };
    expect(parseDecor(decor)).toEqual(decor);
    expect(parseDecor(null)).toBeNull();
    expect(parseDecor({ background: "inconnu", mood: "matin" })).toBeNull();
    expect(decorPrompt(decor).surface).toMatch(/linen/);
    expect(decorPrompt(decor).camera).toMatch(/85mm/);
  });
});
