/**
 * Stockage des vidéos : compartiment privé Supabase « recipe-videos » en production
 * (l'agent y envoie le fichier directement, par un lien d'envoi signé : pas de limite de
 * taille de Vercel), dossier local en développement et dans les tests.
 */
import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, normalize } from "node:path";
import { storageConfigured } from "../images/storage";

export const VIDEO_BUCKET = "recipe-videos";
/** Taille maximale d'une vidéo envoyée par l'agent. */
export const VIDEO_MAX_BYTES = 100 * 1024 * 1024;

export interface UploadInstructions {
  /** Adresse absolue (Supabase) ou chemin de Culinova (stockage local). */
  url: string;
  method: "PUT";
  headers: Record<string, string>;
}

export interface VideoStorage {
  readonly kind: "supabase" | "local";
  /** Lien d'envoi direct, ou null : envoi par Culinova (/api/agent/videos/[id]/fichier). */
  uploadInstructions(key: string): Promise<UploadInstructions | null>;
  put(key: string, bytes: Uint8Array): Promise<void>;
  exists(key: string): Promise<boolean>;
  /** Lecture, éventuellement partielle (« Range: bytes=… ») pour les lecteurs vidéo. */
  read(key: string, range: string | null): Promise<Response | null>;
  remove(keys: string[]): Promise<void>;
}

function safeKey(key: string): string {
  if (!/^[A-Za-z0-9/_.-]+$/.test(key) || key.includes(".."))
    throw new Error(`Clé de stockage invalide : ${key}`);
  return key;
}

class SupabaseVideoStorage implements VideoStorage {
  readonly kind = "supabase" as const;
  private bucketReady = false;

  constructor(
    private readonly url: string,
    private readonly serviceKey: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  private headers(extra: Record<string, string> = {}) {
    return { Authorization: `Bearer ${this.serviceKey}`, apikey: this.serviceKey, ...extra };
  }

  private async ensureBucket() {
    if (this.bucketReady) return;
    const response = await this.fetchImpl(`${this.url}/storage/v1/bucket`, {
      method: "POST",
      headers: this.headers({ "Content-Type": "application/json" }),
      body: JSON.stringify({ id: VIDEO_BUCKET, name: VIDEO_BUCKET, public: false }),
    });
    if (!response.ok && response.status !== 409) {
      const text = await response.text().catch(() => "");
      if (!/already exists|Duplicate/i.test(text)) {
        throw new Error(`Compartiment des vidéos indisponible (${response.status}) : ${text.slice(0, 200)}`);
      }
    }
    this.bucketReady = true;
  }

  async uploadInstructions(key: string): Promise<UploadInstructions> {
    await this.ensureBucket();
    const response = await this.fetchImpl(
      `${this.url}/storage/v1/object/upload/sign/${VIDEO_BUCKET}/${safeKey(key)}`,
      { method: "POST", headers: this.headers({ "Content-Type": "application/json", "x-upsert": "true" }) },
    );
    if (!response.ok) throw new Error(`Lien d'envoi indisponible (${response.status})`);
    const body = (await response.json()) as { url?: string };
    if (!body.url) throw new Error("Lien d'envoi absent de la réponse de Supabase.");
    return {
      url: `${this.url}/storage/v1${body.url}`,
      method: "PUT",
      headers: { "Content-Type": "video/mp4", "x-upsert": "true" },
    };
  }

  async put(key: string, bytes: Uint8Array) {
    await this.ensureBucket();
    const response = await this.fetchImpl(`${this.url}/storage/v1/object/${VIDEO_BUCKET}/${safeKey(key)}`, {
      method: "POST",
      headers: this.headers({ "Content-Type": "video/mp4", "x-upsert": "true" }),
      body: bytes as unknown as BodyInit,
    });
    if (!response.ok) throw new Error(`Envoi de la vidéo impossible (${response.status})`);
  }

  async exists(key: string) {
    const response = await this.read(key, "bytes=0-0");
    await response?.body?.cancel().catch(() => {});
    return response !== null;
  }

  async read(key: string, range: string | null) {
    const response = await this.fetchImpl(`${this.url}/storage/v1/object/${VIDEO_BUCKET}/${safeKey(key)}`, {
      headers: this.headers(range ? { Range: range } : {}),
    });
    if (response.status === 404 || response.status === 400) return null;
    if (!response.ok) throw new Error(`Lecture de la vidéo impossible (${response.status})`);
    return response;
  }

  async remove(keys: string[]) {
    if (keys.length === 0) return;
    const response = await this.fetchImpl(`${this.url}/storage/v1/object/${VIDEO_BUCKET}`, {
      method: "DELETE",
      headers: this.headers({ "Content-Type": "application/json" }),
      body: JSON.stringify({ prefixes: keys.map(safeKey) }),
    });
    if (!response.ok && response.status !== 404)
      throw new Error(`Suppression des vidéos impossible (${response.status})`);
  }
}

/** Plage « bytes=début-fin » d'un fichier de taille connue, ou null si absente ou illisible. */
export function parseRange(range: string | null, size: number): { start: number; end: number } | null {
  const match = range ? /^bytes=(\d*)-(\d*)$/.exec(range.trim()) : null;
  if (!match || (match[1] === "" && match[2] === "")) return null;
  let start: number;
  let end: number;
  if (match[1] === "") {
    start = Math.max(0, size - Number(match[2]));
    end = size - 1;
  } else {
    start = Number(match[1]);
    end = match[2] === "" ? size - 1 : Math.min(Number(match[2]), size - 1);
  }
  return start <= end && start < size ? { start, end } : null;
}

class LocalVideoStorage implements VideoStorage {
  readonly kind = "local" as const;
  constructor(private readonly root: string) {}

  private path(key: string) {
    return normalize(join(this.root, safeKey(key)));
  }

  async uploadInstructions() {
    return null;
  }

  async put(key: string, bytes: Uint8Array) {
    const path = this.path(key);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, bytes);
  }

  async exists(key: string) {
    return stat(this.path(key)).then(
      () => true,
      () => false,
    );
  }

  async read(key: string, range: string | null) {
    const bytes = await readFile(this.path(key)).catch(() => null);
    if (!bytes) return null;
    const part = parseRange(range, bytes.length);
    const headers = { "Content-Type": "video/mp4", "Accept-Ranges": "bytes" };
    if (!part) {
      return new Response(new Uint8Array(bytes), {
        headers: { ...headers, "Content-Length": String(bytes.length) },
      });
    }
    return new Response(new Uint8Array(bytes.subarray(part.start, part.end + 1)), {
      status: 206,
      headers: {
        ...headers,
        "Content-Length": String(part.end - part.start + 1),
        "Content-Range": `bytes ${part.start}-${part.end}/${bytes.length}`,
      },
    });
  }

  async remove(keys: string[]) {
    await Promise.all(keys.map((key) => rm(this.path(key), { force: true })));
  }
}

export function createVideoStorage(
  env: Record<string, string | undefined> = process.env,
  fetchImpl: typeof fetch = fetch,
): VideoStorage {
  if (storageConfigured(env)) {
    return new SupabaseVideoStorage(
      env.NEXT_PUBLIC_SUPABASE_URL!.trim().replace(/\/$/, ""),
      env.SUPABASE_SERVICE_ROLE_KEY!.trim(),
      fetchImpl,
    );
  }
  if (env.NODE_ENV === "production" && !env.IMAGE_STORAGE_DIR) {
    throw new Error(
      "Stockage des vidéos non configuré (NEXT_PUBLIC_SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY).",
    );
  }
  return new LocalVideoStorage(join(env.IMAGE_STORAGE_DIR || join(tmpdir(), "culinova-images"), "videos"));
}

/** Réponse de lecture, en ne transmettant que les en-têtes utiles au lecteur. */
export function videoResponse(source: Response, extra: Record<string, string> = {}): Response {
  const headers = new Headers({ "Content-Type": "video/mp4", "Accept-Ranges": "bytes", ...extra });
  for (const name of ["content-length", "content-range", "etag", "last-modified"]) {
    const value = source.headers.get(name);
    if (value) headers.set(name, value);
  }
  return new Response(source.body, { status: source.status, headers });
}
