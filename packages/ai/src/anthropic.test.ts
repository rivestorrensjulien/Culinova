import Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it, vi } from "vitest";
import { AiGenerationError } from "./adapters";
import { AnthropicAdapter, describeApiError } from "./anthropic";
import { fakeRecipe } from "./fake";
import { costUsdMicros } from "./models";
import { generatedRecipeSchema, recipeProblems } from "./schemas";

const user = "Nombre de personnes : 4";

function message(text: string, stop: Anthropic.Message["stop_reason"] = "end_turn"): Anthropic.Message {
  return {
    id: "msg",
    type: "message",
    role: "assistant",
    model: "claude-sonnet-5-5",
    content: [{ type: "text", text, citations: null }],
    stop_reason: stop,
    stop_sequence: null,
    usage: {
      input_tokens: 1000,
      output_tokens: 5000,
      cache_read_input_tokens: 0,
      cache_creation_input_tokens: 0,
    },
  } as unknown as Anthropic.Message;
}

function adapterWith(...responses: Array<Anthropic.Message | Error>) {
  const create = vi.fn();
  for (const r of responses) {
    if (r instanceof Error) create.mockRejectedValueOnce(r);
    else create.mockResolvedValueOnce(r);
  }
  const adapter = new AnthropicAdapter({ client: { messages: { create } } as unknown as Anthropic });
  return { adapter, create };
}

const request = {
  promptId: "recipe.generate@3",
  system: "système",
  user,
  schema: generatedRecipeSchema,
  validate: (r: ReturnType<typeof fakeRecipe>) => recipeProblems(r, 4),
};

describe("coût d'un appel", () => {
  it("calcule le coût en micro-dollars selon le tarif du modèle", () => {
    // Sonnet 5.5 : 2 $ / M en entrée, 10 $ / M en sortie
    expect(costUsdMicros("claude-sonnet-5-5", { inputTokens: 12_000, outputTokens: 7_000 })).toBe(94_000);
    expect(
      costUsdMicros("claude-sonnet-5-5", { inputTokens: 0, outputTokens: 0, cacheReadTokens: 10_000 }),
    ).toBe(2_000);
    expect(() => costUsdMicros("inconnu", { inputTokens: 1, outputTokens: 1 })).toThrow(/Tarif inconnu/);
  });
});

describe("adaptateur Claude", () => {
  it("envoie le modèle, la réflexion adaptative et le schéma de sortie", async () => {
    const { adapter, create } = adapterWith(message(JSON.stringify(fakeRecipe(user))));
    const result = await adapter.generateStructured(request);
    expect(result.data.name).toContain("Saumon");
    expect(result.usage).toMatchObject({ model: "claude-sonnet-5-5", attempts: 1, costUsdMicros: 52_000 });
    const params = create.mock.calls[0]![0];
    expect(params).toMatchObject({
      model: "claude-sonnet-5-5",
      thinking: { type: "adaptive" },
      output_config: { effort: "high", format: { type: "json_schema" } },
    });
    expect(params.output_config.format).not.toHaveProperty("parse");
    expect(params.system[0].cache_control).toEqual({ type: "ephemeral" });
  });

  it("relance une fois en renvoyant les erreurs, et additionne les coûts", async () => {
    const wrong = { ...fakeRecipe(user), servings: 2 };
    const { adapter, create } = adapterWith(
      message(JSON.stringify(wrong)),
      message(JSON.stringify(fakeRecipe(user))),
    );
    const result = await adapter.generateStructured(request);
    expect(result.usage.attempts).toBe(2);
    expect(result.usage.costUsdMicros).toBe(104_000);
    const second = create.mock.calls[1]![0];
    expect(second.messages).toHaveLength(3);
    expect(second.messages[2].content).toContain("servings doit valoir 4");
  });

  it("abandonne après deux réponses invalides en signalant le coût engagé", async () => {
    const { adapter } = adapterWith(message("pas du json"), message("{}"));
    const error = await adapter.generateStructured(request).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(AiGenerationError);
    expect(error).toMatchObject({ code: "invalid_output", usage: { attempts: 2, costUsdMicros: 104_000 } });
  });

  it("signale un refus et une réponse coupée", async () => {
    const refused = await adapterWith(message("", "refusal"))
      .adapter.generateStructured(request)
      .catch((e: unknown) => e);
    expect(refused).toMatchObject({ code: "refusal" });
    const cut = await adapterWith(message("{", "max_tokens"))
      .adapter.generateStructured(request)
      .catch((e: unknown) => e);
    expect(cut).toMatchObject({ code: "truncated" });
  });

  it("transforme une erreur réseau en erreur de génération", async () => {
    const error = await adapterWith(new Error("ECONNRESET"))
      .adapter.generateStructured(request)
      .catch((e: unknown) => e);
    expect(error).toMatchObject({ code: "provider_error" });
  });

  it("explique clairement un refus de l'API", () => {
    const error = new Anthropic.BadRequestError(
      400,
      { type: "error", error: { type: "invalid_request_error", message: "schema is too complex" } },
      undefined,
      new Headers({ "request-id": "req_123" }),
    );
    expect(describeApiError(error)).toBe(
      "400 · invalid_request_error · schema is too complex · (requête req_123)",
    );
  });
});
