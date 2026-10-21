/**
 * fal.ai (file d'attente) : images et vidéos de la version réaliste. Clé FAL_KEY.
 * Envoi → suivi jusqu'à « COMPLETED » → résultat.
 */
type Queued = { request_id: string; status_url: string; response_url: string };

export class FalClient {
  constructor(
    private readonly key: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  private headers() {
    return { Authorization: `Key ${this.key}`, "Content-Type": "application/json" };
  }

  async run<T>(model: string, input: Record<string, unknown>, timeoutMs = 20 * 60_000): Promise<T> {
    const submitted = await this.fetchImpl(`https://queue.fal.run/${model}`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify(input),
      signal: AbortSignal.timeout(120_000),
    });
    if (!submitted.ok) {
      throw new Error(`fal ${model} : ${submitted.status} ${(await submitted.text()).slice(0, 400)}`);
    }
    const queued = (await submitted.json()) as Queued;
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      if (Date.now() > deadline) throw new Error(`fal ${model} : délai dépassé`);
      await new Promise((r) => setTimeout(r, 5000));
      const status = await this.fetchImpl(queued.status_url, {
        headers: this.headers(),
        signal: AbortSignal.timeout(60_000),
      });
      if (!status.ok) continue;
      const body = (await status.json()) as { status: string };
      if (body.status === "COMPLETED") break;
    }
    const result = await this.fetchImpl(queued.response_url, {
      headers: this.headers(),
      signal: AbortSignal.timeout(120_000),
    });
    const text = await result.text();
    if (!result.ok) throw new Error(`fal ${model} : ${result.status} ${text.slice(0, 400)}`);
    return JSON.parse(text) as T;
  }
}

export async function download(url: string): Promise<Uint8Array> {
  const response = await fetch(url, { signal: AbortSignal.timeout(180_000) });
  if (!response.ok) throw new Error(`Téléchargement impossible (${response.status}) : ${url.slice(0, 120)}`);
  return new Uint8Array(await response.arrayBuffer());
}

export function dataUri(bytes: Uint8Array, type: string): string {
  return `data:${type};base64,${Buffer.from(bytes).toString("base64")}`;
}

/**
 * Envoie un fichier sur le stockage de fal.ai et renvoie son lien (pour les vidéos, trop lourdes
 * pour être passées en data URI). Repli : data URI.
 */
export async function falUpload(key: string, bytes: Uint8Array, type: string, name: string): Promise<string> {
  try {
    const initiate = await fetch(
      "https://rest.alpha.fal.ai/storage/upload/initiate?storage_type=fal-cdn-v3",
      {
        method: "POST",
        headers: { Authorization: `Key ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({ content_type: type, file_name: name }),
        signal: AbortSignal.timeout(60_000),
      },
    );
    if (!initiate.ok) throw new Error(`${initiate.status} ${(await initiate.text()).slice(0, 200)}`);
    const target = (await initiate.json()) as { upload_url: string; file_url: string };
    const put = await fetch(target.upload_url, {
      method: "PUT",
      headers: { "Content-Type": type },
      body: bytes as unknown as BodyInit,
      signal: AbortSignal.timeout(180_000),
    });
    if (!put.ok) throw new Error(`${put.status} ${(await put.text()).slice(0, 200)}`);
    return target.file_url;
  } catch (error) {
    console.error(
      `Envoi sur fal.ai impossible (${error instanceof Error ? error.message : String(error)}), data URI.`,
    );
    return dataUri(bytes, type);
  }
}
