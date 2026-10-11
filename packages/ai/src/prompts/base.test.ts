import { describe, expect, it } from "vitest";
import { fakeBase } from "../fake";
import { BASE_PROMPT_VERSION, baseProblems, buildBasePrompt, generatedBaseSchema } from "./base";

const request = {
  name: "Pains bao",
  neededG: 400,
  neededDisplay: { quantity: 8, unit: "pains" },
  recipe: { name: "Bao au porc laqué", description: "Des bao moelleux.", cuisine: "Taïwanaise" },
  language: "fr" as const,
};

describe("recette de base faite maison", () => {
  it("transmet la préparation et la quantité nécessaire", () => {
    const { user } = buildBasePrompt(request);
    expect(BASE_PROMPT_VERSION).toBe("base.generate@2");
    expect(user).toContain("Préparation : Pains bao");
    expect(user).toContain("Quantité nécessaire : 400 g (8 pains)");
    expect(user).toContain("Recette principale : « Bao au porc laqué »");
    expect(user).toContain("entre 400 g et 800 g");
  });

  it("vérifie que la fournée couvre le besoin, sans excès", () => {
    const base = generatedBaseSchema.parse(fakeBase(buildBasePrompt(request).user));
    expect(base.name).toBe("Pains bao maison");
    expect(base.yieldG).toBe(400);
    expect(baseProblems(base, 400)).toEqual([]);
    expect(baseProblems({ ...base, yieldG: 300 }, 400)).toEqual([
      expect.stringContaining("ne couvre pas la quantité nécessaire"),
    ]);
    expect(baseProblems({ ...base, yieldG: 900 }, 400)).toEqual([expect.stringContaining("trop élevé")]);
    // Un très petit besoin (4 g) peut donner une petite fournée réaliste.
    expect(baseProblems({ ...base, yieldG: 150 }, 4)).toEqual([]);
    // Un nombre de portions différent de 1 n'empêche pas d'enregistrer la base.
    expect(baseProblems({ ...base, servings: 8 }, 400)).toEqual([]);
  });
});
