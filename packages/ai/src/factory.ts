import type { ImageAdapter, LlmAdapter } from "./adapters";
import { AnthropicAdapter } from "./anthropic";
import { FakeLlmAdapter } from "./fake";
import { FakeImageAdapter, FalImageAdapter } from "./fal";
import { DEFAULT_IMAGE_MODEL, DEFAULT_RECIPE_MODEL, IMAGE_COST_USD_MICROS } from "./models";

/**
 * Choisit l'adaptateur selon l'environnement :
 * - AI_PROVIDER=fake → réponses factices (développement, tests) ;
 * - sinon Claude, ce qui exige ANTHROPIC_API_KEY.
 * Sans clé et hors production, on bascule sur le factice en le signalant.
 */
export function createLlmAdapter(
  env: Record<string, string | undefined> = process.env,
  /** Réglages propres à un usage (ex. effort réduit pour une simple estimation). */
  options: { effort?: "low" | "medium" | "high" | "xhigh" | "max" } = {},
): LlmAdapter {
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
    effort:
      options.effort ??
      ((env.AI_RECIPE_EFFORT as "low" | "medium" | "high" | "xhigh" | "max" | undefined) || "high"),
  });
}

/**
 * Adaptateur d'images : FLUX1.1 [pro] via fal.ai si FAL_KEY est définie ; sinon, hors
 * production (ou avec AI_PROVIDER=fake), une image factice.
 */
export function createImageAdapter(env: Record<string, string | undefined> = process.env): ImageAdapter {
  const key = env.FAL_KEY?.trim();
  if (env.AI_PROVIDER === "fake" || !key) {
    if (env.NODE_ENV === "production" && env.AI_PROVIDER !== "fake") {
      throw new Error("FAL_KEY n'est pas définie : impossible de générer des images en production.");
    }
    return new FakeImageAdapter();
  }
  const cost = Number(env.IMAGE_COST_USD_MICROS);
  return new FalImageAdapter({
    apiKey: key,
    model: env.AI_IMAGE_MODEL || DEFAULT_IMAGE_MODEL,
    costUsdMicros: Number.isFinite(cost) && cost > 0 ? cost : IMAGE_COST_USD_MICROS,
  });
}
