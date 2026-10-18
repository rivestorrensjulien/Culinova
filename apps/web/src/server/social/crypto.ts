/**
 * Chiffrement des jetons Instagram et TikTok (AES-256-GCM). La clé SOCIAL_TOKEN_KEY
 * (32 octets, en base64 ou en hexadécimal) ne vit que dans les variables d'environnement.
 */
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

type Env = Record<string, string | undefined>;

export function tokenKey(env: Env = process.env): Buffer | null {
  const raw = env.SOCIAL_TOKEN_KEY?.trim();
  if (!raw) return null;
  const key = /^[0-9a-f]{64}$/i.test(raw) ? Buffer.from(raw, "hex") : Buffer.from(raw, "base64");
  return key.length === 32 ? key : null;
}

export function encryptToken(plain: string, env: Env = process.env): string {
  const key = tokenKey(env);
  if (!key) throw new Error("SOCIAL_TOKEN_KEY manquante ou invalide (32 octets en base64).");
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return `v1:${Buffer.concat([iv, cipher.getAuthTag(), data]).toString("base64url")}`;
}

export function decryptToken(sealed: string, env: Env = process.env): string {
  const key = tokenKey(env);
  if (!key) throw new Error("SOCIAL_TOKEN_KEY manquante ou invalide (32 octets en base64).");
  if (!sealed.startsWith("v1:")) throw new Error("Jeton chiffré illisible.");
  const raw = Buffer.from(sealed.slice(3), "base64url");
  const decipher = createDecipheriv("aes-256-gcm", key, raw.subarray(0, 12));
  decipher.setAuthTag(raw.subarray(12, 28));
  return Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString("utf8");
}
