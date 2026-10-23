import { describe, expect, it } from "vitest";
import { AI_NOTICE, BIO_LINK_NOTICE, buildCaption, MAX_CAPTION, parseMentions } from "./captions";

describe("légendes des réseaux", () => {
  it("nettoie la liste des comptes mentionnés", () => {
    expect(parseMentions("@Maison.Dupont, chef_julien  @maison.dupont nom invalide! @")).toEqual([
      "maison.dupont",
      "chef_julien",
      "nom",
    ]);
  });

  it("assemble texte, lien de la bio, mentions, hashtags et mention IA", () => {
    const caption = buildCaption({
      text: "Des crêpes mille trous moelleuses.",
      hashtags: ["baghrir", "#recette maison", "x", "y", "z", "a", "b", "c", "d"],
      platform: "tiktok",
      settings: { mentions: ["maison.dupont"], aiNotice: true },
    });
    expect(caption).toBe(
      `Des crêpes mille trous moelleuses.\n\n${BIO_LINK_NOTICE}\n\n@maison.dupont\n\n#baghrir #recettemaison #x #y #z #a #b #c\n\n${AI_NOTICE}`,
    );
  });

  it("raccourcit le texte sans jamais perdre la fin", () => {
    const caption = buildCaption({
      text: "a".repeat(3000),
      hashtags: ["recette"],
      platform: "instagram",
      settings: { mentions: [], aiNotice: false },
    });
    expect(caption.length).toBe(MAX_CAPTION);
    expect(caption.endsWith("#recette")).toBe(true);
    expect(caption).toContain(BIO_LINK_NOTICE);
  });

  it("pas de renvoi vers la bio sur Pinterest (l'épingle a son propre lien)", () => {
    const caption = buildCaption({
      text: "Tostadas",
      hashtags: [],
      platform: "pinterest",
      settings: { mentions: [], aiNotice: false },
    });
    expect(caption).toBe("Tostadas");
  });
});
