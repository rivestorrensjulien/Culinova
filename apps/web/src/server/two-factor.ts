/**
 * Second facteur (TOTP, compatible Google Authenticator, 1Password, etc.)
 * obligatoire pour l'administration. Le secret est chiffré (AES-256-GCM),
 * les codes de secours sont hachés, les codes déjà utilisés sont refusés
 * et 5 erreurs consécutives bloquent la saisie 15 minutes.
 */
import type { Database } from "@culinova/db";
import { sessions, twoFactor } from "@culinova/db/schema";
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  randomInt,
  timingSafeEqual,
} from "node:crypto";
import { eq } from "drizzle-orm";
import * as OTPAuth from "otpauth";
import { audit } from "./audit";

export const TOTP_PERIOD = 30;
export const MAX_FAILED_ATTEMPTS = 5;
export const LOCK_DURATION_MS = 15 * 60 * 1000;
const BACKUP_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";

function encryptionKey(): Buffer {
  const secret = process.env.BETTER_AUTH_SECRET;
  if (!secret) throw new Error("BETTER_AUTH_SECRET n'est pas définie (voir .env.example).");
  return createHash("sha256").update(`${secret}:culinova-totp`).digest();
}

export function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return [
    "v1",
    iv.toString("base64url"),
    cipher.getAuthTag().toString("base64url"),
    data.toString("base64url"),
  ].join(":");
}

export function decryptSecret(payload: string): string {
  const [version, iv, tag, data] = payload.split(":");
  if (version !== "v1" || !iv || !tag || !data) throw new Error("Secret chiffré illisible");
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(data, "base64url")), decipher.final()]).toString("utf8");
}

function totpFor(secretBase32: string, label: string): OTPAuth.TOTP {
  return new OTPAuth.TOTP({
    issuer: "Culinova",
    label,
    algorithm: "SHA1",
    digits: 6,
    period: TOTP_PERIOD,
    secret: OTPAuth.Secret.fromBase32(secretBase32),
  });
}

function hashBackupCode(code: string): string {
  return createHash("sha256")
    .update(`culinova-backup:${code.replace(/[\s-]/g, "").toUpperCase()}`)
    .digest("hex");
}

function generateBackupCodes(count = 10): string[] {
  const block = () =>
    Array.from({ length: 4 }, () => BACKUP_ALPHABET[randomInt(BACKUP_ALPHABET.length)]).join("");
  return Array.from({ length: count }, () => `${block()}-${block()}`);
}

export type TwoFactorRow = typeof twoFactor.$inferSelect;

export async function getTwoFactor(db: Database, userId: string): Promise<TwoFactorRow | null> {
  const [row] = await db.select().from(twoFactor).where(eq(twoFactor.userId, userId));
  return row ?? null;
}

/**
 * Prépare l'enrôlement : crée (ou réutilise) un secret non encore confirmé.
 * Renvoie l'URI otpauth:// à afficher en QR code.
 */
export async function startEnrollment(
  db: Database,
  userId: string,
  email: string,
): Promise<{ uri: string; secret: string }> {
  const existing = await getTwoFactor(db, userId);
  if (existing?.enabledAt) throw new Error("Le second facteur est déjà activé");
  let secret: string;
  if (existing) {
    secret = decryptSecret(existing.secretEnc);
  } else {
    secret = new OTPAuth.Secret({ size: 20 }).base32;
    await db.insert(twoFactor).values({ userId, secretEnc: encryptSecret(secret) });
  }
  return { uri: totpFor(secret, email).toString(), secret };
}

export type VerifyResult =
  | { ok: true; method: "totp" | "backup"; backupCodes?: string[] }
  | { ok: false; reason: "invalid" | "locked" | "not_enrolled" };

/**
 * Vérifie un code (TOTP à 6 chiffres, ou code de secours) et, en cas de succès,
 * marque la session comme validée par le second facteur.
 * Lors de l'enrôlement, le premier code valide active le second facteur et
 * génère les codes de secours (renvoyés une seule fois).
 */
export async function verifyAndMarkSession(
  db: Database,
  input: {
    userId: string;
    email: string;
    sessionId: string;
    code: string;
    ip?: string | null;
    userAgent?: string | null;
  },
  now = new Date(),
): Promise<VerifyResult> {
  const row = await getTwoFactor(db, input.userId);
  if (!row) return { ok: false, reason: "not_enrolled" };
  if (row.lockedUntil && row.lockedUntil > now) return { ok: false, reason: "locked" };

  const ctx = { actorId: input.userId, ip: input.ip, userAgent: input.userAgent };
  const code = input.code.replace(/\s/g, "");
  let method: "totp" | "backup" | null = null;
  let usedStep: number | null = null;
  let remainingBackup = row.backupCodesHash;

  if (/^\d{6}$/.test(code)) {
    const totp = totpFor(decryptSecret(row.secretEnc), input.email);
    const delta = totp.validate({ token: code, timestamp: now.getTime(), window: 1 });
    if (delta !== null) {
      const step = Math.floor(now.getTime() / 1000 / TOTP_PERIOD) + delta;
      // Un même code ne peut pas servir deux fois (rejeu).
      if (row.lastUsedStep === null || step > row.lastUsedStep) {
        method = "totp";
        usedStep = step;
      }
    }
  } else if (row.enabledAt) {
    const hash = hashBackupCode(code);
    const match = row.backupCodesHash.find((h) => timingSafeEqual(Buffer.from(h), Buffer.from(hash)));
    if (match) {
      method = "backup";
      remainingBackup = row.backupCodesHash.filter((h) => h !== match);
    }
  }

  if (!method) {
    const failed = row.failedAttempts + 1;
    const locked = failed >= MAX_FAILED_ATTEMPTS;
    await db
      .update(twoFactor)
      .set({
        failedAttempts: locked ? 0 : failed,
        lockedUntil: locked ? new Date(now.getTime() + LOCK_DURATION_MS) : row.lockedUntil,
      })
      .where(eq(twoFactor.id, row.id));
    await audit(db, {
      ...ctx,
      action: "auth.2fa.failed",
      entity: "user",
      entityId: input.userId,
      after: { locked },
    });
    return { ok: false, reason: locked ? "locked" : "invalid" };
  }

  const enrolling = !row.enabledAt;
  const backupCodes = enrolling ? generateBackupCodes() : undefined;
  await db
    .update(twoFactor)
    .set({
      failedAttempts: 0,
      lockedUntil: null,
      lastUsedStep: usedStep ?? row.lastUsedStep,
      backupCodesHash: backupCodes ? backupCodes.map(hashBackupCode) : remainingBackup,
      enabledAt: row.enabledAt ?? now,
    })
    .where(eq(twoFactor.id, row.id));
  await db.update(sessions).set({ twoFactorVerifiedAt: now }).where(eq(sessions.id, input.sessionId));
  await audit(db, {
    ...ctx,
    action: enrolling ? "auth.2fa.enroll" : "auth.2fa.verify",
    entity: "user",
    entityId: input.userId,
    after: { method },
  });
  return backupCodes ? { ok: true, method, backupCodes } : { ok: true, method };
}

/** Génère le code TOTP courant (utilisé par les tests automatisés). */
export function currentTotpCode(secretBase32: string, now = new Date()): string {
  return totpFor(secretBase32, "test").generate({ timestamp: now.getTime() });
}
