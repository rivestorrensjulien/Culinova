/**
 * Adaptateurs interchangeables : le reste de l'application ne dépend que de ces
 * interfaces, jamais directement d'un fournisseur (Anthropic, fal.ai…).
 */
import type { z } from "zod";

/** Consommation mesurée d'un appel, pour les quotas et le suivi du coût IA. */
export interface AiUsage {
  provider: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  /** Coût de l'appel en micro-dollars (1 $ = 1 000 000). */
  costUsdMicros: number;
  durationMs: number;
  /** Nombre d'appels effectués (relances comprises). */
  attempts: number;
}

export interface StructuredGenerationRequest<T extends z.ZodType> {
  /** Identifiant du prompt versionné (ex. "recipe.generate@1"). */
  promptId: string;
  system: string;
  user: string;
  /** Schéma Zod que la réponse JSON doit respecter. */
  schema: T;
  /** Règles métier supplémentaires : renvoie les problèmes à corriger (liste vide si valide). */
  validate?: (data: z.infer<T>) => string[];
  maxOutputTokens?: number;
}

export interface StructuredGenerationResult<T> {
  data: T;
  usage: AiUsage;
}

export interface LlmAdapter {
  readonly provider: string;
  generateStructured<T extends z.ZodType>(
    request: StructuredGenerationRequest<T>,
  ): Promise<StructuredGenerationResult<z.infer<T>>>;
}

/** Erreur de génération exploitable par l'interface (message clair pour l'utilisateur). */
export class AiGenerationError extends Error {
  constructor(
    readonly code: "refusal" | "invalid_output" | "truncated" | "provider_error",
    message: string,
    /** Consommation déjà engagée malgré l'échec (elle est facturée). */
    readonly usage?: AiUsage,
  ) {
    super(message);
    this.name = "AiGenerationError";
  }
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
