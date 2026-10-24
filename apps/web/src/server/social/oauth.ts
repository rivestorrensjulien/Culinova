/**
 * Connexion des comptes Instagram, TikTok et Pinterest (OAuth) depuis l'administration.
 * Un état aléatoire est gardé dans un cookie de 10 minutes et vérifié au retour.
 */
import type { Database } from "@culinova/db";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { appUrl } from "../auth";
import type { CurrentSession } from "../session";
import { type SocialPlatform, saveAccount } from "./accounts";
import { instagramAuthorizeUrl, instagramExchangeCode, instagramProfile } from "./instagram";
import { pinterestAuthorizeUrl, pinterestExchangeCode, pinterestProfile } from "./pinterest";
import { tiktokAuthorizeUrl, tiktokCreatorInfo, tiktokExchangeCode, tiktokProfile } from "./tiktok";

export const OAUTH_COOKIE = "culinova_social_oauth";
export const OAUTH_COOKIE_MAX_AGE_S = 600;

/** Adresse de retour à déclarer chez Meta, TikTok et Pinterest. */
export function redirectUri(platform: SocialPlatform): string {
  return `${appUrl()}/api/agent/${platform}/callback`;
}

export function isSocialPlatform(value: string): value is SocialPlatform {
  return value === "instagram" || value === "tiktok" || value === "pinterest";
}

/** Administrateur avec second facteur validé, hors « se connecter en tant que ». */
export function isFullAdmin(session: CurrentSession | null): session is CurrentSession {
  return Boolean(
    session && session.user.role === "admin" && !session.impersonatedBy && session.twoFactorVerifiedAt,
  );
}

export function newState(platform: SocialPlatform): { state: string; cookie: string } {
  const state = randomBytes(24).toString("base64url");
  return { state, cookie: `${platform}:${state}` };
}

export function stateMatches(
  cookie: string | undefined,
  platform: SocialPlatform,
  state: string | null,
): boolean {
  if (!cookie || !state) return false;
  const expected = Buffer.from(`${platform}:${state}`);
  const given = Buffer.from(cookie);
  return expected.length === given.length && timingSafeEqual(expected, given);
}

export function authorizeUrl(platform: SocialPlatform, state: string): string {
  if (platform === "instagram") return instagramAuthorizeUrl(state, redirectUri(platform));
  if (platform === "pinterest") return pinterestAuthorizeUrl(state, redirectUri(platform));
  return tiktokAuthorizeUrl(state, redirectUri(platform));
}

/** Retour de Meta ou de TikTok : échange du code, profil, jetons chiffrés en base. */
export async function completeConnection(
  db: Database,
  adminId: string,
  platform: SocialPlatform,
  code: string,
  fetchImpl: typeof fetch = fetch,
): Promise<{ username: string | null }> {
  if (platform === "instagram") {
    const token = await instagramExchangeCode(code, redirectUri(platform), fetchImpl);
    const profile = await instagramProfile(token.accessToken, fetchImpl);
    await saveAccount(db, adminId, {
      platform,
      accountId: profile.userId || token.userId,
      username: profile.username,
      accessToken: token.accessToken,
      refreshToken: null,
      expiresAt: token.expiresAt,
      refreshExpiresAt: null,
      scopes: token.scopes,
    });
    return { username: profile.username };
  }
  if (platform === "pinterest") {
    const token = await pinterestExchangeCode(code, redirectUri(platform), fetchImpl);
    const profile = await pinterestProfile(token.accessToken, fetchImpl);
    await saveAccount(db, adminId, {
      platform,
      accountId: profile.username,
      username: profile.username,
      accessToken: token.accessToken,
      refreshToken: token.refreshToken,
      expiresAt: token.expiresAt,
      refreshExpiresAt: token.refreshExpiresAt,
      scopes: token.scopes,
    });
    return { username: profile.username };
  }
  const token = await tiktokExchangeCode(code, redirectUri(platform), fetchImpl);
  const profile = await tiktokProfile(token.accessToken, fetchImpl).catch(() => null);
  // Le nom du compte (@…) vient des informations du créateur (portée video.publish).
  const creator = await tiktokCreatorInfo(token.accessToken, fetchImpl).catch(() => null);
  const username = creator?.username || profile?.username || profile?.displayName || null;
  await saveAccount(db, adminId, {
    platform,
    accountId: token.openId,
    username,
    accessToken: token.accessToken,
    refreshToken: token.refreshToken,
    expiresAt: token.expiresAt,
    refreshExpiresAt: token.refreshExpiresAt,
    scopes: token.scopes,
  });
  return { username };
}
