import type { LlmAdapter } from "./adapters";
import { AnthropicAdapter } from "./anthropic";
import { FakeLlmAdapter } from "./fake";
import { DEFAULT_RECIPE_MODEL } from "./models";

/**
 * Choisit l'adaptateur selon l'environnement :
 * - AI_PROVIDER=fake → réponses factices (développement, tests) ;
 * - sinon Claude, ce qui exige ANTHROPIC_API_KEY.
 * Sans clé et hors production, on bascule sur le factice en le signalant.
 */
export function createLlmAdapter(env: Record<string, string | undefined> = process.env): LlmAdapter {
  const provider = env.AI_PROVIDER ?? (env.ANTHROPIC_API_KEY ? "anthropic" : "fake");
  if (provider === "fake") {
    if (env.NODE_ENV === "production" && env.AI_PROVIDER !== "fake") {
      throw new Error(
        "ANTHROPIC_API_KEY n'est pas définie : impossible de générer des recettes en production.",
      );
    }
    return new FakeLlmAdapter(undefined, Number(env.AI_FAKE_DELAY_MS ?? 0));
  }
  return new AnthropicAdapter({
    workspaceId: env.ANTHROPIC_WORKSPACE_ID?.trim() || undefined,
    model: env.AI_RECIPE_MODEL || DEFAULT_RECIPE_MODEL,
    effort: (env.AI_RECIPE_EFFORT as "low" | "medium" | "high" | "xhigh" | "max" | undefined) || "high",
  });
}
