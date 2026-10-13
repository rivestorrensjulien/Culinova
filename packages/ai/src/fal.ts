/**
 * Adaptateur d'images FLUX1.1 [pro] (Ultra par défaut) via fal.ai (API REST, sans dépendance).
 * Interchangeable : tout autre fournisseur implémente ImageAdapter.
 */
import {
  AiGenerationError,
  type ImageAdapter,
  type ImageGenerationRequest,
  type ImageGenerationResult,
} from "./adapters";
import { DEFAULT_IMAGE_MODEL, IMAGE_COST_USD_MICROS } from "./models";

export interface FalAdapterOptions {
  apiKey: string;
  model?: string;
  /** Coût estimé d'une image, en micro-dollars (fal ne le renvoie pas dans la réponse). */
  costUsdMicros?: number;
  fetchImpl?: typeof fetch;
}

interface FalResponse {
  images?: Array<{ url: string; width?: number; height?: number }>;
  seed?: number;
  has_nsfw_concepts?: boolean[];
}

/** Rapport largeur:hauteur accepté par FLUX Ultra le plus proche de la taille demandée. */
function aspectRatio(width: number, height: number): string {
  const ratios = ["21:9", "16:9", "4:3", "3:2", "1:1", "2:3", "3:4", "9:16", "9:21"];
  const target = width / height;
  return ratios.reduce((best, ratio) => {
    const [w, h] = ratio.split(":").map(Number) as [number, number];
    const [bw, bh] = best.split(":").map(Number) as [number, number];
    return Math.abs(w / h - target) < Math.abs(bw / bh - target) ? ratio : best;
  }, "1:1");
}

export class FalImageAdapter implements ImageAdapter {
  readonly provider = "fal";
  readonly model: string;
  private readonly apiKey: string;
  private readonly cost: number;
  private readonly fetchImpl: typeof fetch;

  constructor(options: FalAdapterOptions) {
    this.apiKey = options.apiKey;
    this.model = options.model ?? DEFAULT_IMAGE_MODEL;
    this.cost = options.costUsdMicros ?? IMAGE_COST_USD_MICROS;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async generate(request: ImageGenerationRequest): Promise<ImageGenerationResult> {
    const started = Date.now();
    const usage = (attempts: number) => ({
      provider: this.provider,
      model: this.model,
      inputTokens: 0,
      outputTokens: 0,
      costUsdMicros: attempts > 0 ? this.cost : 0,
      durationMs: Date.now() - started,
      attempts,
    });
    let response: Response;
    try {
      response = await this.fetchImpl(`https://fal.run/${this.model}`, {
        method: "POST",
        headers: { Authorization: `Key ${this.apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: request.prompt,
          // Ultra : format par rapport (carré, 2048 × 2048) et mode « raw » pour un rendu photo naturel.
          ...(this.model.includes("ultra")
            ? { aspect_ratio: aspectRatio(request.width, request.height), raw: true }
            : { image_size: { width: request.width, height: request.height } }),
          num_images: 1,
          output_format: "jpeg",
          enable_safety_checker: true,
          safety_tolerance: "2",
          ...(request.seed !== undefined ? { seed: request.seed } : {}),
        }),
        signal: AbortSignal.timeout(120_000),
      });
    } catch (error) {
      throw new AiGenerationError(
        "provider_error",
        `Le service d'images n'a pas répondu : ${error instanceof Error ? error.message : String(error)}`,
        usage(0),
      );
    }
    if (!response.ok) {
      const detail = (await response.text().catch(() => "")).slice(0, 500);
      throw new AiGenerationError(
        "provider_error",
        `Le service d'images a répondu ${response.status} : ${detail}`,
        usage(0),
      );
    }
    const data = (await response.json()) as FalResponse;
    const image = data.images?.[0];
    if (!image?.url) throw new AiGenerationError("invalid_output", "Aucune image renvoyée.", usage(1));
    if (data.has_nsfw_concepts?.[0]) {
      throw new AiGenerationError("refusal", "L'image a été bloquée par le filtre de sécurité.", usage(1));
    }
    return {
      url: image.url,
      width: image.width ?? request.width,
      height: image.height ?? request.height,
      seed: data.seed ?? null,
      usage: usage(1),
    };
  }
}

/** Adaptateur factice : aucune image réelle (l'application dessine une image unie à la place). */
export class FakeImageAdapter implements ImageAdapter {
  readonly provider = "fake";
  readonly model = "fake";
  readonly calls: ImageGenerationRequest[] = [];

  async generate(request: ImageGenerationRequest): Promise<ImageGenerationResult> {
    this.calls.push(request);
    return {
      url: "fake://image",
      width: request.width,
      height: request.height,
      seed: 42,
      usage: {
        provider: this.provider,
        model: this.model,
        inputTokens: 0,
        outputTokens: 0,
        costUsdMicros: 0,
        durationMs: 0,
        attempts: 1,
      },
    };
  }
}
