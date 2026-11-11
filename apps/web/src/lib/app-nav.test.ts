import { describe, expect, it } from "vitest";
import { appPages, pageLabel } from "./app-nav";

describe("pages de l'espace connecté", () => {
  it("cache menus et réglages de chiffrage aux particuliers, sans rien supprimer en mode pro", () => {
    const particulier = appPages(false, "menu").map((p) => p.key);
    expect(particulier).toEqual([
      "dashboard",
      "create",
      "recipes",
      "bases",
      "shopping",
      "stock",
      "ingredients",
      "account",
    ]);
    const pro = appPages(true, "menu").map((p) => p.key);
    expect(pro).toEqual(expect.arrayContaining(["menus", "stock", "settings"]));
    expect(appPages(false, "search").map((p) => p.key)).not.toContain("settings");
    expect(appPages(true, "search").map((p) => p.key)).toContain("security");
  });

  it("appelle les ingrédients « Mes prix » et le stock « Mon garde-manger » pour un particulier", () => {
    expect(pageLabel("ingredients", false)).toBe("prices");
    expect(pageLabel("ingredients", true)).toBe("ingredients");
    expect(pageLabel("stock", false)).toBe("pantry");
    expect(pageLabel("stock", true)).toBe("stock");
    expect(pageLabel("recipes", false)).toBe("recipes");
  });
});
