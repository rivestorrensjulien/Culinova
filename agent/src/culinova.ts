/**
 * Échanges avec Culinova (porte de l'agent, clé AGENT_API_KEY) : recettes dont la vidéo
 * est à fabriquer, lien d'envoi du fichier, puis compte rendu.
 */
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

export interface UploadTarget {
  videoId: string;
  upload: { url: string; method: "PUT" | "POST"; headers: Record<string, string> };
}

export class CulinovaClient {
  constructor(
    private readonly baseUrl: string,
    private readonly apiKey: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  private async call<T>(path: string, init: RequestInit = {}): Promise<T> {
    const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
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
    const url = target.upload.url.startsWith("http")
      ? target.upload.url
      : `${this.baseUrl}${target.upload.url}`;
    const sameOrigin = url.startsWith(this.baseUrl);
    const response = await this.fetchImpl(url, {
      method: target.upload.method,
      headers: {
        ...(sameOrigin ? { Authorization: `Bearer ${this.apiKey}` } : {}),
        ...target.upload.headers,
      },
      body: bytes as unknown as BodyInit,
    });
    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(`Envoi de la vidéo impossible : ${response.status} ${text.slice(0, 300)}`);
    }
  }

  async report(videoId: string, report: { status: "ready" } | { status: "failed"; note: string }) {
    await this.call(`/api/agent/videos/${videoId}`, { method: "POST", body: JSON.stringify(report) });
  }
}
