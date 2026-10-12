import { describe, expect, it } from "vitest";
import { bestFoods, type FoodEntry, words } from "./foods";
import { searchUsda } from "./usda";

function food(code: string, nameFr: string): FoodEntry {
  const [head = "", ...rest] = nameFr.split(",");
  return {
    id: code,
    source: "ciqual",
    code,
    nameFr,
    nameEn: null,
    head: words(head),
    rest: words(rest.join(" ")),
  };
}

const foods = [
  food("9100", "Riz blanc, cru"),
  food("9104", "Riz blanc, cuit, sans sel ajouté"),
  food("25601", "Sushi ou maki aux produits de la mer"),
  food("26036", "Saumon, cru, élevage"),
  food("11104", "Sauce soja, préemballée"),
  food("22000", "Œuf, cru"),
];

describe("recherche d'aliments", () => {
  it("normalise les mots (accents, ligatures, pluriels simples)", () => {
    expect(words("Œufs de caille, crus")).toEqual(["oeuf", "caille", "cru"]);
    expect(words("Pavé de saumon")).toEqual(["pave", "saumon"]);
  });

  it("présente d'abord les aliments crus et génériques", () => {
    expect(
      bestFoods("Riz à sushi", foods)
        .map((f) => f.code)
        .slice(0, 2),
    ).toEqual(["9100", "9104"]);
    expect(bestFoods("Pavé de saumon", foods)[0]!.code).toBe("26036");
    expect(bestFoods("Œufs", foods)[0]!.code).toBe("22000");
    expect(bestFoods("Sauce soja", foods)[0]!.code).toBe("11104");
    expect(bestFoods("Yuzu kosho", foods)).toEqual([]);
  });
});

describe("USDA FoodData Central", () => {
  it("lit les valeurs pour 100 g et convertit le sodium en sel", async () => {
    const calls: string[] = [];
    const fakeFetch = (async (url: URL) => {
      calls.push(String(url));
      return new Response(
        JSON.stringify({
          foods: [
            {
              fdcId: 123,
              description: "Yuzu, raw",
              foodNutrients: [
                { nutrientId: 2047, value: 53, unitName: "KCAL" },
                { nutrientId: 1003, value: 0.8, unitName: "G" },
                { nutrientId: 1093, value: 400, unitName: "MG" },
              ],
            },
          ],
        }),
      );
    }) as unknown as typeof fetch;
    expect(await searchUsda("yuzu", "cle", fakeFetch)).toEqual({
      fdcId: 123,
      description: "Yuzu, raw",
      per100g: { kcal: 53, protein: 0.8, salt: 1 },
    });
    expect(calls[0]).toContain("query=yuzu");
    expect(await searchUsda("yuzu", undefined, fakeFetch)).toBeNull();
    expect(calls).toHaveLength(1);
  });
});
