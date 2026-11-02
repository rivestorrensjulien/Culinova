/**
 * État des connexions aux réseaux (demande de Julien du 02/11) : pour chaque réseau, clés
 * présentes, compte relié, échéance, autorisations manquantes et un vrai appel au réseau
 * (profil) pour vérifier que le jeton fonctionne. Lu par la tâche « Programmation des
 * publications » (annotations GitHub) ; aucun jeton ni secret n'est renvoyé.
 */
import type { Database } from "@culinova/db";
import { accountToken, listAccounts, socialSetup, type SocialPlatform } from "./accounts";
import { COMMENT_REPLY_SCOPES, instagramProfile } from "./instagram";
import { PINTEREST_SCOPES, pinterestProfile } from "./pinterest";
import { TIKTOK_SCOPES, tiktokCreatorInfo, tiktokProfile } from "./tiktok";

export interface AccountHealth {
  platform: SocialPlatform;
  /** Clés de l'application présentes dans Vercel. */
  configured: boolean;
  connected: boolean;
  username: string | null;
  expiresAt: string | null;
  expired: boolean;
  /** Autorisations attendues qui manquent (relier à nouveau pour les accorder). */
  missingScopes: string[];
  /** Appel réel au réseau : « ok » ou le message d'erreur. */
  live: string;
  followers: number | null;
  /** Détails propres au réseau (confidentialités TikTok proposées, bac à sable Pinterest…). */
  note: string | null;
}

const EXPECTED: Record<SocialPlatform, readonly string[]> = {
  instagram: COMMENT_REPLY_SCOPES,
  tiktok: TIKTOK_SCOPES,
  pinterest: PINTEREST_SCOPES,
};

const PLATFORMS: SocialPlatform[] = ["instagram", "tiktok", "pinterest"];

function message(error: unknown): string {
  return (error instanceof Error ? error.message : String(error)).slice(0, 200);
}

export async function accountsHealth(
  db: Database,
  fetchImpl: typeof fetch = fetch,
): Promise<AccountHealth[]> {
  const setup = socialSetup();
  const accounts = await listAccounts(db);
  return Promise.all(
    PLATFORMS.map(async (platform): Promise<AccountHealth> => {
      const account = accounts.find((a) => a.platform === platform);
      const base: AccountHealth = {
        platform,
        configured: setup[platform],
        connected: Boolean(account),
        username: account?.username ?? null,
        expiresAt: account?.expiresAt ?? null,
        expired: account?.expired ?? false,
        missingScopes:
          account && account.scopes.length > 0
            ? EXPECTED[platform].filter((scope) => !account.scopes.includes(scope))
            : [],
        live: account ? "non vérifié" : "compte non relié",
        followers: null,
        note:
          platform === "pinterest" && setup.hints.pinterestSandbox
            ? "bac à sable (épingles visibles par le compte seulement)"
            : platform === "tiktok" && setup.hints.tiktokClientKey?.startsWith("sb")
              ? "clés Sandbox (publications privées)"
              : null,
      };
      if (!account) return base;
      if (account.expired) return { ...base, live: "jeton expiré : relier à nouveau" };
      try {
        const token = await accountToken(db, platform, { fetchImpl });
        if (!token) return { ...base, live: "jeton illisible ou clé de chiffrement absente" };
        if (platform === "instagram") {
          const profile = await instagramProfile(token.accessToken, fetchImpl);
          return { ...base, live: "ok", followers: profile.followers ?? null };
        }
        if (platform === "tiktok") {
          const profile = await tiktokProfile(token.accessToken, fetchImpl);
          const creator = await tiktokCreatorInfo(token.accessToken, fetchImpl).catch(() => null);
          const privacy = creator ? `confidentialités : ${creator.privacyOptions.join(", ")}` : null;
          return {
            ...base,
            live: "ok",
            followers: profile.followers ?? null,
            note: [base.note, privacy].filter(Boolean).join(" ; ") || null,
          };
        }
        const profile = await pinterestProfile(token.accessToken, fetchImpl);
        return { ...base, live: "ok", followers: profile.followers ?? null };
      } catch (error) {
        return { ...base, live: `erreur : ${message(error)}` };
      }
    }),
  );
}
