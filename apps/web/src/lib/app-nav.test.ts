import { describe, expect, it } from "vitest";
import { appPages, pageLabel } from "./app-nav";

describe("pages de l'espace connecté", () => {
  it("cache menus, stocks et réglages de chiffrage aux particuliers, sans rien supprimer en mode pro", () => {
    const particulier = appPages(false, "menu").map((p) => p.key);
    expect(particulier).toEqual([
      "dashboard",
      "create",
      "recipes",
      "bases",
      "shopping",
      "ingredients",
      "account",
    ]);
    const pro = appPages(true, "menu").map((p) => p.key);
    expect(pro).toEqual(expect.arrayContaining(["menus", "stock", "settings"]));
    expect(appPages(false, "search").map((p) => p.key)).not.toContain("stock");
    expect(appPages(true, "search").map((p) => p.key)).toContain("security");
  });

  it("appelle les ingrédients « Mes prix » pour un particulier", () => {
    expect(pageLabel("ingredients", false)).toBe("prices");
    expect(pageLabel("ingredients", true)).toBe("ingredients");
    expect(pageLabel("recipes", false)).toBe("recipes");
  });
});
