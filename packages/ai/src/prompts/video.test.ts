import { describe, expect, it } from "vitest";
import { FakeLlmAdapter } from "../fake";
import {
  buildVideoLayersPrompt,
  buildVideoScenesPrompt,
  VIDEO_FORMATS,
  VIDEO_LAYERS_PROMPT_VERSION,
  videoLayersProblems,
  videoLayersSchema,
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

describe("vue éclatée", () => {
  it("transmet le dressage et rend les couches dans l'ordre de pose", async () => {
    const { user } = buildVideoLayersPrompt(input);
    expect(user).toContain("Dressage : Sur une planche en bois.");
    expect(user).not.toContain("Plan 1");
    const ai = new FakeLlmAdapter();
    const result = await ai.generateStructured({
      promptId: VIDEO_LAYERS_PROMPT_VERSION,
      ...buildVideoLayersPrompt(input),
      schema: videoLayersSchema,
    });
    expect(result.data.layers.length).toBeGreaterThanOrEqual(2);
    expect(VIDEO_FORMATS).toContain(result.data.format);
    expect(result.data.cut.strata.length).toBeGreaterThan(0);
    expect(result.data.gesture.action).toBeTruthy();
  });

  it("choisit le format d'après le plat (vue éclatée, coupe, vue du dessus ou geste)", () => {
    const { system } = buildVideoLayersPrompt(input);
    expect(system).toMatch(/coupe pour .*moussaka/);
    expect(system).toMatch(/dessus pour .*currys/);
    expect(system).toMatch(/geste pour .*nappés/);
    // Geste limité à un seul liquide : rien qui tombe en morceaux (retour de Julien du 26/10).
    expect(system).toMatch(/jamais rien qui tombe en morceaux/);
  });

  it("ne coupe jamais une verrine et ne met de vapeur que sur un plat chaud (retour de Julien du 09/11)", async () => {
    const { system } = buildVideoLayersPrompt(input);
    expect(VIDEO_LAYERS_PROMPT_VERSION).toBe("video.layers@5");
    expect(system).toContain("on ne coupe pas au couteau dans un verre");
    expect(system).toContain("Jamais de vapeur ni de fumée sur un plat froid");
    expect(system).toMatch(/false pour .*cheesecakes/);
    const base = (
      await new FakeLlmAdapter().generateStructured({
        promptId: VIDEO_LAYERS_PROMPT_VERSION,
        ...buildVideoLayersPrompt(input),
        schema: videoLayersSchema,
      })
    ).data;
    expect(base.hot).toBe(false);
    const verrine = {
      ...base,
      format: "coupe" as const,
      container: "Six small glass verrines on a marble tray.",
    };
    expect(videoLayersProblems(verrine)).toEqual([expect.stringContaining("verrine")]);
    expect(videoLayersProblems({ ...verrine, format: "geste" })).toEqual([]);
    expect(videoLayersProblems({ ...verrine, container: "A rectangular ceramic baking dish." })).toEqual([]);
  });
});
