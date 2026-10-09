import { describe, expect, it } from "vitest";
import { parseStepQuantityTokens, remapStepQuantityTokens, splitStepText } from "./step-quantities";

describe("quantités citées dans les étapes", () => {
  it("lit les jetons de quantité totale et partielle", () => {
    expect(parseStepQuantityTokens("Fouetter {{i1}} avec {{i2:50}} puis {{ i2 : 25,5 }}.")).toEqual([
      { ref: "i1", part: null },
      { ref: "i2", part: 50 },
      { ref: "i2", part: 25.5 },
    ]);
  });

  it("remplace les références connues et garde les autres", () => {
    const map = new Map([["i1", "abc-1"]]);
    expect(remapStepQuantityTokens("{{i1}} et {{i1:10}} puis {{i9}}", map)).toBe(
      "{{abc-1}} et {{abc-1:10}} puis {{i9}}",
    );
  });

  it("découpe le texte pour l'affichage", () => {
    expect(splitStepText("Ajouter {{i1:250}} au bol.")).toEqual([
      { kind: "text", text: "Ajouter " },
      { kind: "quantity", ref: "i1", part: 250 },
      { kind: "text", text: " au bol." },
    ]);
    expect(splitStepText("Sans quantité.")).toEqual([{ kind: "text", text: "Sans quantité." }]);
  });
});
