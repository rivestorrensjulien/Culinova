/**
 * Échanges avec Culinova (porte de l'agent, clé AGENT_API_KEY) : recettes dont la vidéo
 * est à fabriquer, lien d'envoi du fichier, puis compte rendu.
 */
import type { LayerScript } from "./video/exploded.ts";
import type { SceneScript } from "./video/realistic.ts";

export interface VideoJob {
  recipeId: string;
  versionId: string;
  name: string;
  hook: string;
  shots: string[];
  /** Photo 9:16 de la recette (celle de sa page) : la vidéo la montre du début à la fin. */
  imageId: string;
  photoUrl: string;
}

export interface CarouselJob {
  recipeId: string;
  versionId: string;
  name: string;
  servings: number;
  totalMinutes: number;
  ingredients: Array<{ label: string; amount: string }>;
  steps: string[];
  /** Étapes résumées (script TikTok), pour « la recette en bref ». */
  summary?: string[];
  /** Photo 4:5 de la recette (celle de sa page). */
  imageId: string;
  photoUrl: string;
}

type Upload = { url: string; method: "PUT" | "POST"; headers: Record<string, string> };

export interface UploadTarget {
  videoId: string;
  upload: Upload;
}

export class CulinovaClient {
  constructor(
    private readonly baseUrl: string,
    private readonly apiKey: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  private async call<T>(path: string, init: RequestInit = {}): Promise<T> {
    const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
      // Jamais d'attente sans fin : 2 minutes au plus par appel.
      signal: AbortSignal.timeout(120_000),
      ...init,
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
        ...init.headers,
      },
    });
    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(`Culinova ${init.method ?? "GET"} ${path} : ${response.status} ${text.slice(0, 300)}`);
    }
    return (await response.json()) as T;
  }

  /** Recettes « à publier » (nom et identifiant), ou une recette précise. */
  async queue(recipeId?: string): Promise<Array<{ recipeId: string; name: string }>> {
    const query = recipeId ? `?recette=${encodeURIComponent(recipeId)}` : "";
    return (
      await this.call<{ recipes: Array<{ recipeId: string; name: string }> }>(
        `/api/agent/publications${query}`,
      )
    ).recipes;
  }

  /** Découpage en scènes de la vidéo réaliste (écrit par Claude côté Culinova, mis en cache). */
  async scenes(recipeId: string, fresh = false): Promise<SceneScript> {
    const query = `?recette=${encodeURIComponent(recipeId)}${fresh ? "&nouveau=1" : ""}`;
    return (await this.call<{ scenes: SceneScript }>(`/api/agent/scenes${query}`)).scenes;
  }

  /** Couches de la vue éclatée (écrites par Claude côté Culinova, mises en cache). */
  async layers(recipeId: string, fresh = false): Promise<LayerScript> {
    const query = `?recette=${encodeURIComponent(recipeId)}${fresh ? "&nouveau=1" : ""}`;
    return (await this.call<{ layers: LayerScript }>(`/api/agent/couches${query}`)).layers;
  }

  async jobs(recipeId?: string): Promise<VideoJob[]> {
    const query = recipeId ? `?recette=${encodeURIComponent(recipeId)}` : "";
    return (await this.call<{ videos: VideoJob[] }>(`/api/agent/videos${query}`)).videos;
  }

  async register(input: {
    recipeId: string;
    versionId: string;
    imageId: string;
    durationS: number;
    width: number;
    height: number;
    sizeBytes: number;
  }): Promise<UploadTarget> {
    return this.call<UploadTarget>("/api/agent/videos", { method: "POST", body: JSON.stringify(input) });
  }

  async upload(target: UploadTarget, bytes: Uint8Array): Promise<void> {
    await this.send(target.upload, bytes);
  }

  /** Envoie un fichier au lien donné par Culinova (Supabase signé, ou Culinova en local). */
  async send(upload: Upload, bytes: Uint8Array): Promise<void> {
    const url = upload.url.startsWith("http") ? upload.url : `${this.baseUrl}${upload.url}`;
    const sameOrigin = url.startsWith(this.baseUrl);
    const response = await this.fetchImpl(url, {
      signal: AbortSignal.timeout(180_000),
      method: upload.method,
      headers: { ...(sameOrigin ? { Authorization: `Bearer ${this.apiKey}` } : {}), ...upload.headers },
      body: bytes as unknown as BodyInit,
    });
    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(`Envoi du fichier impossible : ${response.status} ${text.slice(0, 300)}`);
    }
  }

  async carouselJobs(recipeId?: string): Promise<CarouselJob[]> {
    const query = recipeId ? `?recette=${encodeURIComponent(recipeId)}` : "";
    return (await this.call<{ carousels: CarouselJob[] }>(`/api/agent/carrousels${query}`)).carousels;
  }

  async registerCarousel(input: {
    recipeId: string;
    versionId: string;
    imageId: string;
    slideCount: number;
  }): Promise<{ carouselId: string; uploads: Upload[] }> {
    return this.call("/api/agent/carrousels", { method: "POST", body: JSON.stringify(input) });
  }

  async reportCarousel(carouselId: string, report: { status: "ready" } | { status: "failed"; note: string }) {
    await this.call(`/api/agent/carrousels/${carouselId}`, { method: "POST", body: JSON.stringify(report) });
  }

  async report(videoId: string, report: { status: "ready" } | { status: "failed"; note: string }) {
    await this.call(`/api/agent/videos/${videoId}`, { method: "POST", body: JSON.stringify(report) });
  }
}
