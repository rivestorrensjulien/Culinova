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
