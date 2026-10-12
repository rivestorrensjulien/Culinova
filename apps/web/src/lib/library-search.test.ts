import { describe, expect, it } from "vitest";
import { matchesQuery, normalize, parseLibraryQuery, type SearchableRecipe } from "./library-search";

const moments = [
  { code: "dessert", label: "Dessert" },
  { code: "main", label: "Plat" },
  { code: "street_food", label: "Street food" },
];

const bao: SearchableRecipe = {
  name: "Bao au poulet laqué façon saté",
  description: "Des bao moelleux.",
  cuisineLabel: "Asie du Sud-Est",
  momentCode: "street_food",
  momentLabel: "Street food",
  totalS: 25 * 60,
  difficulty: "easy",
  diets: ["lactose_free"],
  ingredients: ["Pains bao", "Cuisses de poulet", "Cacahuètes"],
};

describe("recherche dans la bibliothèque", () => {
  it("normalise accents et ligatures", () => {
    expect(normalize("Œufs brouillés, crème")).toBe("oeufs brouilles creme");
  });

  it("découpe une demande en langage courant", () => {
    expect(parseLibraryQuery("poulet rapide sans gluten", moments)).toEqual({
      terms: ["poulet"],
      maxMinutes: 30,
      diets: ["gluten_free"],
      difficulty: null,
      moments: [],
    });
    expect(parseLibraryQuery("Desserts faciles en moins de 20 min", moments)).toMatchObject({
      terms: [],
      maxMinutes: 20,
      difficulty: "easy",
      moments: ["dessert"],
    });
    expect(parseLibraryQuery("street food végétarienne", moments)).toMatchObject({
      moments: ["street_food"],
      diets: ["vegetarian"],
    });
  });

  it("filtre par mots, temps, régime, difficulté et moment", () => {
    const q = (text: string) => matchesQuery(bao, parseLibraryQuery(text, moments));
    expect(q("poulet")).toBe(true);
    expect(q("cacahuètes")).toBe(true);
    expect(q("poulet rapide sans lactose")).toBe(true);
    expect(q("poulet sans gluten")).toBe(false);
    expect(q("street food facile")).toBe(true);
    expect(q("dessert")).toBe(false);
    expect(q("moins de 15 min")).toBe(false);
    expect(q("saumon")).toBe(false);
  });
});
