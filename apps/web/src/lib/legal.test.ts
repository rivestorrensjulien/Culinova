import { describe, expect, it } from "vitest";
import { fillLegalPlaceholders, missingLegalFields, parseLegalIdentity, pendingDocuments } from "./legal";

describe("documents juridiques", () => {
  it("remplit les champs de l'éditeur et signale ceux qui manquent", () => {
    const text = "Édité par **{{editeur.nom}}**, {{editeur.forme}}. SIRET : {{editeur.siret}}.";
    expect(fillLegalPlaceholders(text, { nom: "Julien R.", forme: "entrepreneur individuel" })).toBe(
      "Édité par **Julien R.**, entrepreneur individuel. SIRET : [à compléter].",
    );
  });

  it("neutralise la mise en forme saisie", () => {
    expect(fillLegalPlaceholders("{{editeur.nom}}", { nom: "Chez *Julien*" })).toBe("Chez \\*Julien\\*");
  });

  it("ne garde que les champs connus et non vides", () => {
    expect(parseLegalIdentity({ nom: " Culinova ", siret: "", pirate: "x", email: 3 })).toEqual({
      nom: "Culinova",
    });
    expect(parseLegalIdentity(null)).toEqual({});
    expect(missingLegalFields({ nom: "A", forme: "B", adresse: "C", siret: "D", email: "E" })).toEqual([
      "directeur",
    ]);
  });

  it("demande d'accepter une nouvelle version déjà acceptée auparavant", () => {
    const current = [
      { id: "cgu-2", type: "cgu" },
      { id: "privacy-1", type: "privacy" },
    ];
    // CGU acceptées en version 1 seulement, confidentialité à jour.
    expect(
      pendingDocuments(current, [
        { legalDocumentId: "cgu-1", type: "cgu" },
        { legalDocumentId: "privacy-1", type: "privacy" },
      ]),
    ).toEqual([{ id: "cgu-2", type: "cgu" }]);
    // Compte créé sans consentement (administrateur initial) : rien n'est demandé.
    expect(pendingDocuments(current, [])).toEqual([]);
  });
});
