import { describe, expect, it } from "vitest";
import { fakeNutritionMatches } from "../fake";
import {
  buildNutritionMatchPrompt,
  NUTRITION_MATCH_PROMPT_VERSION,
  nutritionMatchProblems,
  nutritionMatchSchema,
} from "./nutrition";

const items = [
  {
    id: "n1",
    name: "Riz à sushi",
    candidates: [
      { code: "9100", name: "Riz blanc, cru" },
      { code: "9104", name: "Riz blanc, cuit, sans sel ajouté" },
    ],
  },
  { id: "n2", name: "Yuzu kosho", candidates: [] },
];

describe("correspondance nutritionnelle", () => {
  it("présente chaque ingrédient avec ses candidats", () => {
    const { user } = buildNutritionMatchPrompt(items);
    expect(NUTRITION_MATCH_PROMPT_VERSION).toBe("nutrition.match@1");
    expect(user).toContain("- n1 · Riz à sushi\n  · 9100 · Riz blanc, cru\n  · 9104 · Riz blanc, cuit");
    expect(user).toContain("- n2 · Yuzu kosho\n  (aucun candidat)");
  });

  it("refuse un code hors des candidats ou une réponse incomplète", () => {
    const fake = nutritionMatchSchema.parse(fakeNutritionMatches(buildNutritionMatchPrompt(items).user));
    expect(fake.matches).toEqual([
      { id: "n1", code: "9100", englishName: "Riz à sushi" },
      { id: "n2", code: null, englishName: "Yuzu kosho" },
    ]);
    expect(nutritionMatchProblems(fake, items)).toEqual([]);
    expect(
      nutritionMatchProblems({ matches: [{ id: "n1", code: "1234", englishName: "rice" }] }, items),
    ).toEqual(["Le code 1234 n'est pas parmi les candidats de n1.", "Correspondance manquante pour n2."]);
  });
});
