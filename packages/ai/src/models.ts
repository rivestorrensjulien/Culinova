/** Modèles utilisés par défaut (modifiables par variable d'environnement). */
export const DEFAULT_RECIPE_MODEL = "claude-sonnet-5-5";
export const DEFAULT_IMAGE_MODEL = "fal-ai/flux-pro/v1.1";

/** Formats d'image : tous recadrés depuis une seule image HD (pas de génération supplémentaire). */
export const IMAGE_FORMATS = ["1:1", "4:5", "9:16", "16:9"] as const;
export type ImageFormat = (typeof IMAGE_FORMATS)[number];

/**
 * Tarifs en dollars par million de jetons (Claude API, octobre 2026).
 * À mettre à jour si les tarifs changent : le coût de chaque génération en dépend.
 */
export const MODEL_PRICING: Record<
  string,
  { input: number; output: number; cacheRead: number; cacheWrite: number }
> = {
  "claude-sonnet-5-5": { input: 2, output: 10, cacheRead: 0.2, cacheWrite: 2.5 },
  "claude-opus-5-5": { input: 4, output: 20, cacheRead: 0.2, cacheWrite: 5 },
  "claude-haiku-4-5": { input: 1, output: 5, cacheRead: 0.1, cacheWrite: 1.25 },
};

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
}

/**
 * Coût d'un appel en micro-dollars (1 $ = 1 000 000).
 * Un tarif en $ par million de jetons vaut exactement des micro-dollars par jeton.
 */
export function costUsdMicros(model: string, usage: TokenUsage): number {
  const price = MODEL_PRICING[model];
  if (!price) throw new Error(`Tarif inconnu pour le modèle ${model}`);
  return Math.round(
    usage.inputTokens * price.input +
      usage.outputTokens * price.output +
      (usage.cacheReadTokens ?? 0) * price.cacheRead +
      (usage.cacheWriteTokens ?? 0) * price.cacheWrite,
  );
}

/** Estimation prudente d'une génération de recette (pour le contrôle du budget avant l'appel). */
export const RECIPE_GENERATION_ESTIMATE_USD_MICROS = 150_000;
