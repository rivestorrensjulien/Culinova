import { describe, expect, it } from "vitest";
import { AnthropicAdapter } from "./anthropic";
import { createLlmAdapter } from "./factory";
import { FakeLlmAdapter } from "./fake";

describe("choix de l'adaptateur", () => {
  it("utilise Claude quand une clé est fournie", () => {
    expect(createLlmAdapter({ ANTHROPIC_API_KEY: "sk-test" })).toBeInstanceOf(AnthropicAdapter);
  });

  it("accepte un espace de travail Anthropic pour une clé non rattachée", () => {
    expect(
      createLlmAdapter({ ANTHROPIC_API_KEY: "sk-test", ANTHROPIC_WORKSPACE_ID: "wrkspc_test" }),
    ).toBeInstanceOf(AnthropicAdapter);
  });

  it("utilise le factice sans clé en développement, ou sur demande", () => {
    expect(createLlmAdapter({ NODE_ENV: "development" })).toBeInstanceOf(FakeLlmAdapter);
    expect(createLlmAdapter({ AI_PROVIDER: "fake", NODE_ENV: "production" })).toBeInstanceOf(FakeLlmAdapter);
  });

  it("refuse de démarrer en production sans clé", () => {
    expect(() => createLlmAdapter({ NODE_ENV: "production" })).toThrow(/ANTHROPIC_API_KEY/);
  });
});
