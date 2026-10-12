/**
 * Stockage des images : Supabase Storage en production (API REST, compartiment privé),
 * dossier local en développement et dans les tests. Les images ne sont jamais publiques :
 * elles sont servies par l'application, après vérification de la propriétaire.
 */
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, normalize } from "node:path";

export interface ImageStorage {
  readonly kind: "supabase" | "local";
  put(key: string, bytes: Uint8Array, contentType: string): Promise<void>;
  get(key: string): Promise<Uint8Array | null>;
  /** Supprime des fichiers (sans erreur s'ils n'existent plus). */
  remove(keys: string[]): Promise<void>;
}

export const IMAGE_BUCKET = "recipe-images";

function safeKey(key: string): string {
  if (!/^[A-Za-z0-9/_.-]+$/.test(key) || key.includes(".."))
    throw new Error(`Clé de stockage invalide : ${key}`);
  return key;
}

export class SupabaseStorage implements ImageStorage {
  readonly kind = "supabase" as const;
  private bucketReady = false;

  constructor(
    private readonly url: string,
    private readonly serviceKey: string,
    private readonly bucket = IMAGE_BUCKET,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  private headers(extra: Record<string, string> = {}) {
    return { Authorization: `Bearer ${this.serviceKey}`, apikey: this.serviceKey, ...extra };
  }

  /** Crée le compartiment privé au premier envoi (sans effet s'il existe déjà). */
  private async ensureBucket() {
    if (this.bucketReady) return;
    const response = await this.fetchImpl(`${this.url}/storage/v1/bucket`, {
      method: "POST",
      headers: this.headers({ "Content-Type": "application/json" }),
      body: JSON.stringify({ id: this.bucket, name: this.bucket, public: false }),
    });
    if (!response.ok && response.status !== 409) {
      const text = await response.text().catch(() => "");
      if (!/already exists|Duplicate/i.test(text)) {
        throw new Error(`Compartiment de stockage indisponible (${response.status}) : ${text.slice(0, 200)}`);
      }
    }
    this.bucketReady = true;
  }

  async put(key: string, bytes: Uint8Array, contentType: string) {
    await this.ensureBucket();
    const response = await this.fetchImpl(`${this.url}/storage/v1/object/${this.bucket}/${safeKey(key)}`, {
      method: "POST",
      headers: this.headers({ "Content-Type": contentType, "x-upsert": "true" }),
      body: bytes as unknown as BodyInit,
    });
    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(`Envoi de l'image impossible (${response.status}) : ${text.slice(0, 200)}`);
    }
  }

  async get(key: string) {
    const response = await this.fetchImpl(`${this.url}/storage/v1/object/${this.bucket}/${safeKey(key)}`, {
      headers: this.headers(),
    });
    if (response.status === 404 || response.status === 400) return null;
    if (!response.ok) throw new Error(`Lecture de l'image impossible (${response.status})`);
    return new Uint8Array(await response.arrayBuffer());
  }

  async remove(keys: string[]) {
    // L'API accepte des lots ; on reste prudent avec 500 fichiers par appel.
    for (let i = 0; i < keys.length; i += 500) {
      const batch = keys.slice(i, i + 500).map(safeKey);
      const response = await this.fetchImpl(`${this.url}/storage/v1/object/${this.bucket}`, {
        method: "DELETE",
        headers: this.headers({ "Content-Type": "application/json" }),
        body: JSON.stringify({ prefixes: batch }),
      });
      if (!response.ok && response.status !== 404) {
        throw new Error(`Suppression des images impossible (${response.status})`);
      }
    }
  }
}

export class LocalStorage implements ImageStorage {
  readonly kind = "local" as const;
  constructor(private readonly root: string) {}

  private path(key: string) {
    return normalize(join(this.root, safeKey(key)));
  }

  async put(key: string, bytes: Uint8Array) {
    const path = this.path(key);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, bytes);
  }

  async get(key: string) {
    try {
      return new Uint8Array(await readFile(this.path(key)));
    } catch {
      return null;
    }
  }

  async remove(keys: string[]) {
    await Promise.all(keys.map((key) => rm(this.path(key), { force: true })));
  }
}

export function storageConfigured(env: Record<string, string | undefined> = process.env): boolean {
  return Boolean(env.NEXT_PUBLIC_SUPABASE_URL?.trim() && env.SUPABASE_SERVICE_ROLE_KEY?.trim());
}

/** Supabase si configuré ; sinon un dossier local (refusé en production). */
export function createImageStorage(env: Record<string, string | undefined> = process.env): ImageStorage {
  if (storageConfigured(env)) {
    return new SupabaseStorage(
      env.NEXT_PUBLIC_SUPABASE_URL!.trim().replace(/\/$/, ""),
      env.SUPABASE_SERVICE_ROLE_KEY!.trim(),
    );
  }
  if (env.NODE_ENV === "production" && !env.IMAGE_STORAGE_DIR) {
    throw new Error(
      "Stockage des images non configuré (NEXT_PUBLIC_SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY).",
    );
  }
  return new LocalStorage(env.IMAGE_STORAGE_DIR || join(tmpdir(), "culinova-images"));
}

/** Génération possible : un fournisseur d'images et un stockage (ou le mode factice hors production). */
export function imagesAvailable(env: Record<string, string | undefined> = process.env): boolean {
  if (env.NODE_ENV !== "production" || env.AI_PROVIDER === "fake") {
    return true;
  }
  return Boolean(env.FAL_KEY?.trim()) && (storageConfigured(env) || Boolean(env.IMAGE_STORAGE_DIR));
}
