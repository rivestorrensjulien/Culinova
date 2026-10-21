import { describe, expect, it } from "vitest";
import { FakeLlmAdapter } from "../fake";
import {
  buildVideoScenesPrompt,
  VIDEO_SCENES_PROMPT_VERSION,
  videoScenesProblems,
  videoScenesSchema,
} from "./video";

const input = {
  name: "Tostadas",
  ingredients: [{ label: "Œufs", amount: "100 g (2 œufs)" }],
  steps: ["Pocher les œufs.", "Dresser."],
  plating: "Sur une planche en bois.",
  hook: "Le meilleur petit-déjeuner",
  shots: ["Pocher les œufs sans remuer", "Dresser sur la planche"],
};

describe("découpage en scènes de la vidéo réaliste", () => {
  it("transmet la recette complète et le script", () => {
    const { user } = buildVideoScenesPrompt(input);
    expect(user).toContain("Œufs : 100 g (2 œufs)");
    expect(user).toContain("Plan 2 : Dresser sur la planche");
    expect(user).toContain("Rends exactement 2 plans");
  });

  it("exige un plan par ligne du script, dans l'ordre", async () => {
    const ai = new FakeLlmAdapter();
    const result = await ai.generateStructured({
      promptId: VIDEO_SCENES_PROMPT_VERSION,
      ...buildVideoScenesPrompt(input),
      schema: videoScenesSchema,
    });
    expect(videoScenesProblems(result.data, 2)).toEqual([]);
    expect(videoScenesProblems(result.data, 3)).toEqual(["plans : attendu 3, reçu 2."]);
  });
});
