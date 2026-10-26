/** Provenance des demandes d'invitation : lue dans l'adresse ou le site précédent, sans cookie. */
import { describe, expect, it } from "vitest";
import {
  readSource,
  referrerHost,
  sourceDetail,
  sourceFromForm,
  sourceLabel,
  sourceQuery,
  withRecipe,
} from "./request-source";

const OWN = ["culinova.fr"];

describe("provenance des demandes", () => {
  it("lit les paramètres utm du message « RECETTE » et de Pinterest", () => {
    const dm = readSource(
      new URLSearchParams("utm_source=instagram&utm_medium=message&utm_campaign=commente"),
      null,
      OWN,
    );
    expect(dm).toEqual({
      source: "instagram",
      medium: "message",
      campaign: "commente",
      recipe: null,
      referrer: null,
    });
    expect(sourceDetail(dm)).toBe("message privé « RECETTE »");
    expect(readSource({ utm_source: "Pinterest", utm_medium: "social" }).source).toBe("pinterest");
  });

  it("raccourci du lien en bio : ?de=instagram", () => {
    const bio = readSource({ de: "IG" });
    expect(bio).toMatchObject({ source: "instagram", medium: "bio" });
    expect(sourceDetail(bio)).toBe("lien en bio");
  });

  it("sans paramètre : réseau reconnu d'après le site précédent, Culinova ignoré", () => {
    expect(readSource({}, "https://l.instagram.com/?u=x", OWN)).toMatchObject({
      source: "instagram",
      referrer: "l.instagram.com",
    });
    expect(readSource({}, "https://www.google.fr/search?q=secret", OWN)).toMatchObject({
      source: "google",
      referrer: "google.fr",
    });
    expect(readSource({}, "https://blog.example.org/article", OWN).source).toBe("site");
    expect(readSource({}, "https://culinova.fr/recettes", OWN).source).toBe("direct");
    expect(readSource({}, null, OWN).source).toBe("direct");
    // Seul le nom de domaine est gardé, jamais l'adresse complète.
    expect(referrerHost("https://www.google.fr/search?q=secret")).toBe("google.fr");
    expect(referrerHost("pas une adresse")).toBeNull();
  });

  it("suit la personne de page en page jusqu'au formulaire", () => {
    const visit = withRecipe(
      readSource({ utm_source: "tiktok", utm_medium: "social" }),
      "Tostadas-Argentines",
    );
    expect(sourceQuery(visit)).toEqual({
      utm_source: "tiktok",
      utm_medium: "social",
      recette: "tostadas-argentines",
    });
    // La recette d'origine n'est pas remplacée par la suivante.
    expect(withRecipe(readSource(sourceQuery(visit)), "autre").recipe).toBe("tostadas-argentines");
    expect(sourceQuery(readSource({}))).toEqual({});
  });

  it("nettoie les champs cachés du formulaire", () => {
    const form = new FormData();
    form.set("src_source", "<script>Insta</script>");
    form.set("src_medium", "message");
    form.set("src_recipe", "tostadas-argentines");
    form.set("src_referrer", "javascript:alert(1)");
    expect(sourceFromForm(form)).toEqual({
      source: "script-insta-script",
      medium: "message",
      campaign: null,
      recipe: "tostadas-argentines",
      referrer: null,
    });
    expect(sourceFromForm(new FormData()).source).toBe("direct");
  });

  it("libellés pour l'administration", () => {
    expect(sourceLabel("tiktok")).toBe("TikTok");
    expect(sourceLabel("direct")).toBe("Accès direct");
    expect(sourceLabel(null)).toBe("Inconnue (avant le suivi)");
    expect(sourceDetail({ medium: null, campaign: null })).toBeNull();
  });
});
