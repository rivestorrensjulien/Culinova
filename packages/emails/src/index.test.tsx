import { describe, expect, it } from "vitest";
import { renderMagicLinkEmail } from "./index";

describe("e-mail de lien magique", () => {
  it("contient le lien et la durée de validité", async () => {
    const email = await renderMagicLinkEmail({
      url: "https://exemple.fr/connexion?token=abc",
      expiresInMinutes: 15,
    });
    expect(email.subject).toContain("connexion");
    expect(email.html).toContain("https://exemple.fr/connexion?token=abc");
    expect(email.text).toContain("15 minutes");
  });
});
