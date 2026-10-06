import { describe, expect, it } from "vitest";
import { normalizeIngredientName } from "./ingredient-names";

describe("normalisation des noms d'ingrédients", () => {
  it("rapproche les variantes d'un même nom", () => {
    expect(normalizeIngredientName("Ail")).toBe("ail");
    expect(normalizeIngredientName("  Échalotes ")).toBe("echalote");
    expect(normalizeIngredientName("Pavé de saumon (sans peau)")).toBe("pave de saumon");
    expect(normalizeIngredientName("L'huile d'olive")).toBe("huile d'olive");
    expect(normalizeIngredientName("200 g de farine")).toBe("farine");
    expect(normalizeIngredientName("Crème fraîche épaisse")).toBe(
      normalizeIngredientName("creme fraiche epaisse"),
    );
    expect(normalizeIngredientName("Graines de sésame")).toBe("graine de sesame");
    expect(normalizeIngredientName("Riz à sushi")).toBe("riz a sushi");
  });

  it("gère l'anglais et les mots qui finissent par s", () => {
    expect(normalizeIngredientName("The sesame seeds")).toBe("sesame seed");
    expect(normalizeIngredientName("Couscous")).toBe("couscou");
    expect(normalizeIngredientName("Cress")).toBe("cress");
    expect(normalizeIngredientName("Pois chiches")).toBe("poi chiche");
  });
});
