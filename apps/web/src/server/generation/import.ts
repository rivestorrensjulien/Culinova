/**
 * Import d'une recette existante : texte collé, ou texte d'une page web lu par le
 * serveur. L'IA la réécrit au format Culinova ; cela compte comme une recette du mois.
 */
import { IMPORT_MAX_CHARS } from "@culinova/ai";
import type { Database } from "@culinova/db";
import * as s from "@culinova/db/schema";
import { consumeQuota } from "../quotas";
import { budgetAllows, quotaRefusal, type StartRefusal } from "./start";

type ImportRefusal = StartRefusal | { ok: false; reason: "empty" };
export type ImportStart = { ok: true; generationId: string } | ImportRefusal;

/** Texte minimal pour qu'un import ait un sens. */
export const IMPORT_MIN_CHARS = 40;

export async function startImport(
  db: Database,
  input: { userId: string; text: string; language: "fr" | "en"; now?: Date },
): Promise<ImportStart> {
  const now = input.now ?? new Date();
  const text = input.text.trim().slice(0, IMPORT_MAX_CHARS);
  if (text.length < IMPORT_MIN_CHARS) return { ok: false, reason: "empty" };
  if (!(await budgetAllows(db))) return { ok: false, reason: "budget" };
  const quota = await consumeQuota(db, { userId: input.userId, metric: "recipes", now });
  if (!quota.allowed) return quotaRefusal("recipes", quota.limit, now);
  const [generation] = await db
    .insert(s.aiGenerations)
    .values({
      userId: input.userId,
      kind: "import",
      status: "queued",
      inputRef: `import:${input.language}`,
      instruction: text,
    })
    .returning({ id: s.aiGenerations.id });
  return { ok: true, generationId: generation!.id };
}

const PRIVATE_HOST =
  /^(localhost|.*\.local|.*\.internal|0\.0\.0\.0|127\.\d+\.\d+\.\d+|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+|169\.254\.\d+\.\d+|\[.*\])$/i;

/** Adresse acceptée : http(s) public, sans identifiants ni port exotique. */
export function safeImportUrl(raw: string): URL | null {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  if (url.username || url.password) return null;
  if (url.port && url.port !== "80" && url.port !== "443") return null;
  if (PRIVATE_HOST.test(url.hostname) || !url.hostname.includes(".")) return null;
  return url;
}

/** Texte lisible d'une page HTML : sans scripts, styles ni balises. */
export function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<(br|\/p|\/li|\/h\d|\/div|\/tr)[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/[ \t\f\v]+/g, " ")
    .replace(/\s*\n\s*/g, "\n")
    .trim();
}

/**
 * Données de recette structurées (schema.org/Recipe) publiées par la plupart des sites :
 * plus fiables que le texte de la page quand elles existent.
 */
export function recipeJsonLd(html: string): string | null {
  for (const match of html.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const data: unknown = JSON.parse(match[1]!);
      const found = findRecipe(data);
      if (found) return JSON.stringify(found);
    } catch {
      // Bloc illisible : on passe au suivant.
    }
  }
  return null;
}

function findRecipe(node: unknown): unknown {
  if (Array.isArray(node)) {
    for (const item of node) {
      const found = findRecipe(item);
      if (found) return found;
    }
    return null;
  }
  if (node && typeof node === "object") {
    const record = node as Record<string, unknown>;
    const type = record["@type"];
    if (type === "Recipe" || (Array.isArray(type) && type.includes("Recipe"))) return record;
    if (record["@graph"]) return findRecipe(record["@graph"]);
  }
  return null;
}

export type FetchedPage = { ok: true; text: string } | { ok: false; reason: "url" | "fetch" };

/** Lit une page web (10 s, 2 Mo au plus) et en garde la recette, ou à défaut le texte. */
export async function fetchRecipePage(raw: string, fetchImpl: typeof fetch = fetch): Promise<FetchedPage> {
  const url = safeImportUrl(raw);
  if (!url) return { ok: false, reason: "url" };
  try {
    const response = await fetchImpl(url, {
      redirect: "follow",
      signal: AbortSignal.timeout(10_000),
      headers: { "User-Agent": "CulinovaImport/1.0 (+https://culinova.app)", Accept: "text/html" },
    });
    // Une redirection vers une adresse interne est refusée.
    if (!response.ok || (response.url && !safeImportUrl(response.url))) return { ok: false, reason: "fetch" };
    const reader = response.body?.getReader();
    if (!reader) return { ok: false, reason: "fetch" };
    const chunks: Uint8Array[] = [];
    let size = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 2_000_000) {
        await reader.cancel();
        break;
      }
      chunks.push(value);
    }
    const html = new TextDecoder().decode(Buffer.concat(chunks));
    const structured = recipeJsonLd(html);
    const title = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1]?.trim() ?? "";
    const text = structured ? `${title}\n${structured}` : htmlToText(html);
    return { ok: true, text: `Source : ${url.toString()}\n${text}`.slice(0, IMPORT_MAX_CHARS) };
  } catch {
    return { ok: false, reason: "fetch" };
  }
}
