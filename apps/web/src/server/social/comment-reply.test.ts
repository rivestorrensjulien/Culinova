/** « Commente RECETTE » : mot-clé reconnu, invitation dans la légende, message envoyé. */
import { describe, expect, it } from "vitest";
import {
  commentInviteLine,
  matchesKeyword,
  normalizeKeyword,
  replyMessage,
  withCommentInvite,
} from "./comment-reply";

describe("Commente RECETTE", () => {
  it("reconnaît le mot-clé quelle que soit son écriture, jamais à l'intérieur d'un autre mot", () => {
    expect(normalizeKeyword(" Récette ! ")).toBe("RECETTE");
    expect(matchesKeyword("recette", "RECETTE")).toBe(true);
    expect(matchesKeyword("RÉCETTE stp 🙏", "RECETTE")).toBe(true);
    expect(matchesKeyword("Recette!!! j'adore", "RECETTE")).toBe(true);
    expect(matchesKeyword("trop bon", "RECETTE")).toBe(false);
    expect(matchesKeyword("mesrecettes", "RECETTE")).toBe(false);
  });

  it("ajoute l'invitation avant le lien et les hashtags, une seule fois", () => {
    const caption =
      "Une moussaka fondante.\n\n🔗 La recette complète : culinova.fr/recette/moussaka\n\n#moussaka";
    const invited = withCommentInvite(caption, "recette");
    expect(invited.split("\n\n")).toEqual([
      "Une moussaka fondante.",
      commentInviteLine("RECETTE"),
      "🔗 La recette complète : culinova.fr/recette/moussaka",
      "#moussaka",
    ]);
    expect(withCommentInvite(invited, "RECETTE")).toBe(invited);
  });

  it("message privé : salutation, nom de la recette et lien", () => {
    const message = replyMessage({
      username: "marie.cuisine",
      name: "Moussaka grecque",
      url: "https://culinova.fr/recette/moussaka",
    });
    expect(message).toContain("@marie.cuisine");
    expect(message).toContain("« Moussaka grecque »");
    expect(message).toContain("https://culinova.fr/recette/moussaka");
  });
});
