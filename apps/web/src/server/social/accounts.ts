/**
 * Comptes Instagram et TikTok reliés par l'administrateur : jetons chiffrés en base,
 * renouvelés automatiquement avant expiration (Instagram : 60 jours ; TikTok : 24 h,
 * avec un jeton de renouvellement valable un an).
 */
import type { Database } from "@culinova/db";
import * as s from "@culinova/db/schema";
import { eq } from "drizzle-orm";
import { audit } from "../audit";
import { decryptToken, encryptToken, tokenKey } from "./crypto";
import { instagramConfig, instagramRefresh } from "./instagram";
import { tiktokConfig, tiktokRefresh } from "./tiktok";

export type SocialPlatform = s.PublicationPlatform;

export interface AccountToken {
  platform: SocialPlatform;
  accountId: string;
  username: string | null;
  accessToken: string;
}

export interface AccountSummary {
  platform: SocialPlatform;
  username: string | null;
  connectedAt: string;
  expiresAt: string | null;
  /** Le jeton ne peut plus être renouvelé : il faut relier le compte à nouveau. */
  expired: boolean;
}

export interface SocialSetup {
  /** Clé de chiffrement des jetons présente. */
  tokenKey: boolean;
  instagram: boolean;
  tiktok: boolean;
}

export function socialSetup(env: Record<string, string | undefined> = process.env): SocialSetup {
  return {
    tokenKey: tokenKey(env) !== null,
    instagram: instagramConfig(env) !== null,
    tiktok: tiktokConfig(env) !== null,
  };
}

export async function saveAccount(
  db: Database,
  adminId: string,
  account: {
    platform: SocialPlatform;
    accountId: string;
    username: string | null;
    accessToken: string;
    refreshToken: string | null;
    expiresAt: Date | null;
    refreshExpiresAt: Date | null;
    scopes: string[];
  },
): Promise<void> {
  const values = {
    accountId: account.accountId,
    username: account.username,
    accessTokenEnc: encryptToken(account.accessToken),
    refreshTokenEnc: account.refreshToken ? encryptToken(account.refreshToken) : null,
    expiresAt: account.expiresAt,
    refreshExpiresAt: account.refreshExpiresAt,
    scopes: account.scopes,
    connectedBy: adminId,
  };
  await db
    .insert(s.socialAccounts)
    .values({ platform: account.platform, ...values })
    .onConflictDoUpdate({ target: s.socialAccounts.platform, set: { ...values, updatedAt: new Date() } });
  await audit(db, {
    actorId: adminId,
    action: "social.connect",
    entity: "social_account",
    after: { platform: account.platform, username: account.username },
  });
}

export async function disconnectAccount(db: Database, adminId: string, platform: SocialPlatform) {
  await db.delete(s.socialAccounts).where(eq(s.socialAccounts.platform, platform));
  await audit(db, {
    actorId: adminId,
    action: "social.disconnect",
    entity: "social_account",
    after: { platform },
  });
}

function isExpired(row: typeof s.socialAccounts.$inferSelect, now: Date): boolean {
  if (row.platform === "tiktok") return Boolean(row.refreshExpiresAt && row.refreshExpiresAt <= now);
  return Boolean(row.expiresAt && row.expiresAt <= now);
}

export async function listAccounts(db: Database, now = new Date()): Promise<AccountSummary[]> {
  const rows = await db.select().from(s.socialAccounts);
  return rows.map((row) => ({
    platform: row.platform,
    username: row.username,
    connectedAt: row.updatedAt.toISOString(),
    expiresAt: (row.platform === "tiktok" ? row.refreshExpiresAt : row.expiresAt)?.toISOString() ?? null,
    expired: isExpired(row, now),
  }));
}

const DAY = 24 * 3600 * 1000;

/**
 * Jeton utilisable d'un compte relié, renouvelé si besoin (Instagram à moins de 7 jours
 * de l'échéance, TikTok à moins de 10 minutes). Null si le compte n'est pas relié ou expiré.
 */
export async function accountToken(
  db: Database,
  platform: SocialPlatform,
  options: { fetchImpl?: typeof fetch; now?: Date } = {},
): Promise<AccountToken | null> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const now = options.now ?? new Date();
  const [row] = await db.select().from(s.socialAccounts).where(eq(s.socialAccounts.platform, platform));
  if (!row || isExpired(row, now) || !tokenKey()) return null;
  let accessToken = decryptToken(row.accessTokenEnc);
  const expiresSoon = (limitMs: number) =>
    !row.expiresAt || row.expiresAt.getTime() - now.getTime() < limitMs;

  if (platform === "instagram" && expiresSoon(7 * DAY)) {
    const fresh = await instagramRefresh(accessToken, fetchImpl, now);
    accessToken = fresh.accessToken;
    await db
      .update(s.socialAccounts)
      .set({ accessTokenEnc: encryptToken(fresh.accessToken), expiresAt: fresh.expiresAt })
      .where(eq(s.socialAccounts.id, row.id));
  } else if (platform === "tiktok" && expiresSoon(10 * 60 * 1000) && row.refreshTokenEnc) {
    const fresh = await tiktokRefresh(decryptToken(row.refreshTokenEnc), fetchImpl, process.env, now);
    accessToken = fresh.accessToken;
    await db
      .update(s.socialAccounts)
      .set({
        accessTokenEnc: encryptToken(fresh.accessToken),
        refreshTokenEnc: encryptToken(fresh.refreshToken),
        expiresAt: fresh.expiresAt,
        refreshExpiresAt: fresh.refreshExpiresAt,
      })
      .where(eq(s.socialAccounts.id, row.id));
  }
  return { platform, accountId: row.accountId, username: row.username, accessToken };
}
