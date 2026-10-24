import { describe, expect, it } from "vitest";
import { leadTime, looksStoreBought } from "./homemade";

describe("produits achetés tout prêts", () => {
  it("repère les préparations souvent achetées", () => {
    for (const name of [
      "Pains bao",
      "Pâte feuilletée",
      "Biscuits boudoirs",
      "Fond de veau",
      "Yuzu kosho",
      "Masa harina",
      "Pain complet de campagne",
      "Pâtes fraîches",
      "Garam masala",
      "Ricotta",
      "Ghee",
      "Tahini",
      "Sauce tomate",
    ]) {
      expect(looksStoreBought(name)).toBe(true);
    }
  });

  it("ignore les produits bruts", () => {
    for (const name of [
      "Farine de blé",
      "Œufs",
      "Carottes",
      "Sauce soja",
      "Beurre doux",
      "Paprika fumé",
      "Miso blanc",
      "Épinards",
    ]) {
      expect(looksStoreBought(name)).toBe(false);
    }
  });
});

describe("préparation en amont", () => {
  it("additionne la base et la recette, arrondi au quart d'heure supérieur", () => {
    // Pains bao : 30 min de préparation, 15 min de cuisson, 1 h 30 de pousse ; recette : 45 min.
    const lead = leadTime({ prepS: 1800, cookS: 900, restS: 5400 }, { prepS: 1800, cookS: 600, restS: 300 });
    expect(lead).toEqual({ baseTotalS: 8100, recipeTotalS: 2700, startBeforeServiceS: 10800 });
  });

  it("garde un compte rond quand il tombe juste", () => {
    expect(
      leadTime({ prepS: 900, cookS: 0, restS: 0 }, { prepS: 900, cookS: 0, restS: 0 }).startBeforeServiceS,
    ).toBe(1800);
  });
});
