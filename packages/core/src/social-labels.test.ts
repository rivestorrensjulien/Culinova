import { describe, expect, it } from "vitest";
import { formatMinutes, readableRecipeTime, shortDishName } from "./social-labels";

describe("nom court de la couverture (28/11)", () => {
  it("garde la partie avant la virgule, le tiret ou la parenthèse", () => {
    expect(shortDishName("Mujaddara libanaise, oignons dorés et yaourt au concombre")).toBe(
      "Mujaddara libanaise",
    );
    expect(shortDishName("Shorbet adas – Soupe de lentilles libanaise")).toBe("Shorbet adas");
    expect(shortDishName("Phở bò (soupe vietnamienne de nouilles de riz au bœuf)")).toBe("Phở bò");
    expect(shortDishName("Cheesecake végane New York, spécial congélation")).toBe(
      "Cheesecake végane New York",
    );
    expect(shortDishName("Moussaka grecque traditionnelle")).toBe("Moussaka grecque traditionnelle");
  });

  it("5 mots au plus, sans finir sur « de », « aux »…", () => {
    expect(shortDishName("Potaje de frijoles negros cubain de grand-mère")).toBe(
      "Potaje de frijoles negros cubain",
    );
    expect(shortDishName("Tarte fine aux pommes et au caramel salé")).toBe("Tarte fine aux pommes");
  });
});

describe("temps lisible (28/11)", () => {
  it("heures et minutes", () => {
    expect(formatMinutes(45)).toBe("45 min");
    expect(formatMinutes(60)).toBe("1 h");
    expect(formatMinutes(88)).toBe("1 h 28");
    expect(formatMinutes(90)).toBe("1 h 30");
    expect(formatMinutes(616)).toBe("10 h 15");
  });

  it("sépare le travail de l'attente", () => {
    expect(readableRecipeTime({ prepMinutes: 30, cookMinutes: 58, restMinutes: 0 })).toBe("1 h 28");
    expect(
      readableRecipeTime({
        prepMinutes: 20,
        cookMinutes: 0,
        restMinutes: 120,
        steps: ["Réserver les verrines au réfrigérateur 2 heures."],
      }),
    ).toBe("20 min + 2 h au frais");
    expect(
      readableRecipeTime({
        prepMinutes: 15,
        cookMinutes: 30,
        restMinutes: 570,
        steps: ["Faire tremper les haricots toute une nuit."],
      }),
    ).toBe("45 min + trempage la veille");
    expect(readableRecipeTime({ prepMinutes: 20, cookMinutes: 10, restMinutes: 60 })).toBe(
      "30 min + 1 h de repos",
    );
  });
});
