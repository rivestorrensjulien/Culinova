/**
 * Adaptateurs interchangeables : le reste de l'application ne dépend que de ces
 * interfaces, jamais directement d'un fournisseur (Anthropic, fal.ai…).
 * Les implémentations réelles arrivent aux jalons J2 (texte) et J4 (images).
 */
import type { z } from "zod";

/** Consommation mesurée d'un appel, pour les quotas et le suivi du coût IA. */
export interface AiUsage {
  provider: string;
  model: string;
  inputTokens?: number;
  outputTokens?: number;
  /** Coût estimé de l'appel, en centimes (peut être fractionnaire avant agrégation). */
  costCents: number;
  durationMs: number;
}

export interface StructuredGenerationRequest<T extends z.ZodType> {
  /** Identifiant du prompt versionné (ex. "recipe.generate@1"). */
  promptId: string;
  system: string;
  user: string;
  /** Schéma Zod que la réponse JSON doit respecter. */
  schema: T;
  maxOutputTokens?: number;
}

export interface StructuredGenerationResult<T> {
  data: T;
  usage: AiUsage;
}

export interface LlmAdapter {
  generateStructured<T extends z.ZodType>(
    request: StructuredGenerationRequest<T>,
  ): Promise<StructuredGenerationResult<z.infer<T>>>;
}

export interface ImageGenerationRequest {
  prompt: string;
  /** Format de l'image HD source (les autres formats sont recadrés à partir d'elle). */
  aspectRatio: "16:9" | "1:1";
  seed?: number;
}

export interface ImageGenerationResult {
  /** URL temporaire chez le fournisseur ; l'image est ensuite copiée dans notre stockage. */
  url: string;
  width: number;
  height: number;
  usage: AiUsage;
}

export interface ImageAdapter {
  generate(request: ImageGenerationRequest): Promise<ImageGenerationResult>;
}
