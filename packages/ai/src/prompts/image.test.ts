import { describe, expect, it } from "vitest";
import { FakeImageAdapter, FalImageAdapter } from "../fal";
import { buildImagePrompt, fallbackImagePrompt, IMAGE_PROMPT_VERSION, imagePromptProblems } from "./image";

const input = {
  name: "Bao au poulet façon saté",
  description: "Des bao moelleux.",
  cuisine: "Asie du Sud-Est",
  moment: "Street food",
  ingredients: ["Pains bao", "Poulet"],
  plating: {
    description: "Glissez chaque bao dans une barquette en bambou garnie de papier sulfurisé.",
    plate: "Barquette en bambou",
    positioning: "Deux bao côte à côte",
    garnish: "Coriandre",
    sauce: null,
    finish: null,
    decoration: null,
  },
};

describe("prompt photo", () => {
  it("transmet le dressage et impose un cadrage recadrable", () => {
    const { system, user } = buildImagePrompt(input);
    expect(IMAGE_PROMPT_VERSION).toBe("image.prompt@7");
    expect(system).toContain("Authenticity first");
    expect(system).toContain("never straight overhead");
    expect(system).toContain("cropped to square, 4:5, 9:16 and 16:9");
    expect(system).toContain("No text");
    expect(system).toContain("never a bite mark");
    expect(system).toContain("Vietnamese bánh mì");
    expect(system).not.toContain("already bitten");
    expect(user).toContain("Barquette en bambou");
  });

  it("vérifie la longueur et sait se passer de l'IA", () => {
    expect(imagePromptProblems({ prompt: "trop court" })).toEqual([expect.stringContaining("trop court")]);
    expect(imagePromptProblems({ prompt: Array(80).fill("mot").join(" ") })).toEqual([]);
    const fallback = fallbackImagePrompt(input);
    expect(fallback).toContain("Bao au poulet façon saté");
    expect(fallback).toContain("barquette en bambou");
  });
});

describe("adaptateur fal.ai", () => {
  it("envoie la taille demandée et lit l'image renvoyée", async () => {
    const requests: Array<{ url: string; body: Record<string, unknown>; auth: string | null }> = [];
    const fakeFetch = (async (url: string, init: RequestInit) => {
      requests.push({
        url,
        body: JSON.parse(String(init.body)),
        auth: new Headers(init.headers).get("authorization"),
      });
      return new Response(
        JSON.stringify({ images: [{ url: "https://cdn/x.jpg", width: 1440, height: 1440 }], seed: 7 }),
      );
    }) as unknown as typeof fetch;
    const adapter = new FalImageAdapter({
      apiKey: "cle",
      model: "fal-ai/flux-pro/v1.1",
      costUsdMicros: 100,
      fetchImpl: fakeFetch,
    });
    const result = await adapter.generate({ prompt: "a dish", width: 1440, height: 1440 });
    expect(result).toMatchObject({ url: "https://cdn/x.jpg", width: 1440, height: 1440, seed: 7 });
    expect(result.usage.costUsdMicros).toBe(100);
    expect(requests[0]!.url).toBe("https://fal.run/fal-ai/flux-pro/v1.1");
    expect(requests[0]!.auth).toBe("Key cle");
    expect(requests[0]!.body).toMatchObject({ prompt: "a dish", image_size: { width: 1440, height: 1440 } });
  });

  it("utilise FLUX.2 [pro] par défaut, à la taille demandée", async () => {
    const bodies: Array<Record<string, unknown>> = [];
    const urls: string[] = [];
    const fakeFetch = (async (url: string, init: RequestInit) => {
      urls.push(url);
      bodies.push(JSON.parse(String(init.body)));
      return new Response(JSON.stringify({ images: [{ url: "https://cdn/z.jpg" }], seed: 3 }));
    }) as unknown as typeof fetch;
    const result = await new FalImageAdapter({ apiKey: "cle", fetchImpl: fakeFetch }).generate({
      prompt: "a dish",
      width: 1440,
      height: 1440,
    });
    expect(urls[0]).toBe("https://fal.run/fal-ai/flux-2-pro");
    expect(bodies[0]).toMatchObject({ image_size: { width: 1440, height: 1440 }, output_format: "jpeg" });
    expect(bodies[0]).not.toHaveProperty("num_images");
    expect(result).toMatchObject({ width: 1440, height: 1440, seed: 3 });
  });

  it("utilise FLUX Ultra en mode raw, au format carré", async () => {
    const bodies: Array<Record<string, unknown>> = [];
    const urls: string[] = [];
    const fakeFetch = (async (url: string, init: RequestInit) => {
      urls.push(url);
      bodies.push(JSON.parse(String(init.body)));
      return new Response(
        JSON.stringify({ images: [{ url: "https://cdn/y.jpg", width: 2048, height: 2048 }] }),
      );
    }) as unknown as typeof fetch;
    const result = await new FalImageAdapter({
      apiKey: "cle",
      model: "fal-ai/flux-pro/v1.1-ultra",
      fetchImpl: fakeFetch,
    }).generate({ prompt: "a dish", width: 1440, height: 1440 });
    expect(urls[0]).toBe("https://fal.run/fal-ai/flux-pro/v1.1-ultra");
    expect(bodies[0]).toMatchObject({ aspect_ratio: "1:1", raw: true, output_format: "jpeg" });
    expect(bodies[0]).not.toHaveProperty("image_size");
    expect(result).toMatchObject({ width: 2048, height: 2048 });
  });

  it("signale une erreur du service et une image bloquée", async () => {
    const failing = (async () => new Response("quota", { status: 429 })) as unknown as typeof fetch;
    await expect(
      new FalImageAdapter({ apiKey: "k", fetchImpl: failing }).generate({
        prompt: "p",
        width: 64,
        height: 64,
      }),
    ).rejects.toMatchObject({ code: "provider_error" });
    const blocked = (async () =>
      new Response(
        JSON.stringify({ images: [{ url: "u" }], has_nsfw_concepts: [true] }),
      )) as unknown as typeof fetch;
    await expect(
      new FalImageAdapter({ apiKey: "k", fetchImpl: blocked }).generate({
        prompt: "p",
        width: 64,
        height: 64,
      }),
    ).rejects.toMatchObject({ code: "refusal" });
    expect((await new FakeImageAdapter().generate({ prompt: "p", width: 64, height: 64 })).url).toBe(
      "fake://image",
    );
  });
});
