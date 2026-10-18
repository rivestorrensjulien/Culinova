import { describe, expect, it } from "vitest";
import { parseVideoScript } from "./script";

describe("script vidéo", () => {
  it("sépare l'accroche et les plans, sans les consignes de tournage", () => {
    expect(
      parseVideoScript(
        [
          "Accroche (0-3 s) : Des bao moelleux comme au marché de nuit !",
          "Plan 1 : Disposer les ingrédients sur le plan de travail",
          "",
          "Plan 2 : Pétrir la pâte jusqu'à ce qu'elle soit lisse.",
          "Plan 3 : Dresser les bao dans le panier vapeur et inviter à enregistrer la recette",
        ].join("\n"),
      ),
    ).toEqual({
      hook: "Des bao moelleux comme au marché de nuit !",
      shots: [
        "Disposer les ingrédients sur le plan de travail",
        "Pétrir la pâte jusqu'à ce qu'elle soit lisse",
        "Dresser les bao dans le panier vapeur",
      ],
    });
  });

  it("refuse un script sans accroche ou sans plan", () => {
    expect(parseVideoScript("Plan 1 : Mélanger")).toBeNull();
    expect(parseVideoScript("Accroche : Miam")).toBeNull();
    expect(parseVideoScript(null)).toBeNull();
  });
});
