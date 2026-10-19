import { describe, expect, it } from "vitest";
import { AI_NOTICE, buildCaption, MAX_CAPTION, parseMentions } from "./captions";

describe("légendes des réseaux", () => {
  it("nettoie la liste des comptes mentionnés", () => {
    expect(parseMentions("@Maison.Dupont, chef_julien  @maison.dupont nom invalide! @")).toEqual([
      "maison.dupont",
      "chef_julien",
      "nom",
    ]);
  });

  it("assemble texte, mentions, hashtags et mention IA", () => {
    const caption = buildCaption({
      text: "Des crêpes mille trous moelleuses.",
      hashtags: ["baghrir", "#recette maison", "x", "y", "z", "a", "b", "c", "d"],
      platform: "tiktok",
      settings: { mentions: ["maison.dupont"], aiNotice: true },
    });
    expect(caption).toBe(
      `Des crêpes mille trous moelleuses.\n\n@maison.dupont\n\n#baghrir #recettemaison #x #y #z #a #b #c\n\n${AI_NOTICE}`,
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
  });
});
