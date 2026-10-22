/**
 * API TikTok (application « Culinova Agent » : Login Kit et Content Posting API, Direct Post).
 * Portées : user.info.basic, user.info.stats, video.list, video.publish, video.upload.
 * Variables : TIKTOK_CLIENT_KEY, TIKTOK_CLIENT_SECRET. Tant que l'application n'a pas passé
 * l'audit de TikTok, les vidéos ne peuvent être publiées qu'en privé (SELF_ONLY).
 */
import { type PostMetrics, SocialApiError } from "./instagram";

type Env = Record<string, string | undefined>;

export const TIKTOK_SCOPES = [
  "user.info.basic",
  "user.info.stats",
  "video.list",
  "video.publish",
  "video.upload",
] as const;
const API = "https://open.tiktokapis.com/v2";

export function tiktokConfig(env: Env = process.env) {
  const clientKey = env.TIKTOK_CLIENT_KEY?.trim();
  const secret = env.TIKTOK_CLIENT_SECRET?.trim();
  return clientKey && secret ? { clientKey, secret } : null;
}

/** Erreurs TikTok expliquées simplement (les autres gardent le message de TikTok). */
const TIKTOK_ERRORS: Record<string, string> = {
  unaudited_client_can_only_post_to_private_accounts:
    "tant que l'application n'a pas passé l'audit de TikTok, le compte TikTok doit être en mode privé " +
    "(TikTok → Profil → ☰ → Paramètres et confidentialité → Confidentialité → Compte privé), puis réessayez",
  spam_risk_too_many_posts: "trop de publications aujourd'hui sur ce compte, réessayez demain",
  reached_active_user_cap: "limite quotidienne d'utilisateurs de l'application atteinte, réessayez demain",
  privacy_level_option_mismatch: "choisissez une confidentialité proposée par TikTok",
  url_ownership_unverified: "le domaine culinova.fr n'est pas vérifié dans l'application TikTok",
  access_token_invalid: "le compte TikTok doit être relié à nouveau (Administration → Réseaux)",
  scope_not_authorized: "autorisation manquante : reliez à nouveau le compte TikTok",
};

type Envelope<T> = { data?: T; error?: { code?: string; message?: string; log_id?: string } };
type TiktokBody<T> = Envelope<T> & { error_description?: string; access_token?: string };

async function read<T>(response: Response, what: string): Promise<T> {
  const body = (await response.json().catch(() => null)) as TiktokBody<T> | null;
  const code = body?.error?.code;
  if (!response.ok || !body || (code && code !== "ok")) {
    const detail =
      (code && TIKTOK_ERRORS[code]) ||
      body?.error?.message ||
      body?.error_description ||
      code ||
      String(response.status);
    throw new SocialApiError(`TikTok · ${what} : ${detail}${code ? ` (${code})` : ""}`, response.status);
  }
  return (body.data ?? (body as unknown)) as T;
}

export function tiktokAuthorizeUrl(state: string, redirectUri: string, env: Env = process.env): string {
  const config = tiktokConfig(env);
  if (!config) throw new Error("TIKTOK_CLIENT_KEY et TIKTOK_CLIENT_SECRET manquants.");
  const params = new URLSearchParams({
    client_key: config.clientKey,
    response_type: "code",
    scope: TIKTOK_SCOPES.join(","),
    redirect_uri: redirectUri,
    state,
  });
  return `https://www.tiktok.com/v2/auth/authorize/?${params}`;
}

export interface TiktokToken {
  accessToken: string;
  refreshToken: string;
  openId: string;
  expiresAt: Date;
  refreshExpiresAt: Date;
  scopes: string[];
}

type TokenBody = {
  access_token: string;
  refresh_token: string;
  open_id: string;
  expires_in: number;
  refresh_expires_in: number;
  scope?: string;
};

function token(body: TokenBody, now: Date): TiktokToken {
  if (!body.access_token) throw new SocialApiError("TikTok · jeton absent de la réponse", 502);
  return {
    accessToken: body.access_token,
    refreshToken: body.refresh_token,
    openId: body.open_id,
    expiresAt: new Date(now.getTime() + body.expires_in * 1000),
    refreshExpiresAt: new Date(now.getTime() + body.refresh_expires_in * 1000),
    scopes: (body.scope ?? "").split(",").filter(Boolean),
  };
}

async function tokenRequest(params: Record<string, string>, fetchImpl: typeof fetch, env: Env, now: Date) {
  const config = tiktokConfig(env);
  if (!config) throw new Error("TIKTOK_CLIENT_KEY et TIKTOK_CLIENT_SECRET manquants.");
  const response = await fetchImpl(`${API}/oauth/token/`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_key: config.clientKey, client_secret: config.secret, ...params }),
  });
  return token(await read<TokenBody>(response, "jeton"), now);
}

export function tiktokExchangeCode(
  code: string,
  redirectUri: string,
  fetchImpl: typeof fetch = fetch,
  env: Env = process.env,
  now = new Date(),
) {
  return tokenRequest(
    { code, grant_type: "authorization_code", redirect_uri: redirectUri },
    fetchImpl,
    env,
    now,
  );
}

export function tiktokRefresh(
  refreshToken: string,
  fetchImpl: typeof fetch = fetch,
  env: Env = process.env,
  now = new Date(),
) {
  return tokenRequest({ grant_type: "refresh_token", refresh_token: refreshToken }, fetchImpl, env, now);
}

export interface TiktokProfile {
  openId: string;
  username: string | null;
  displayName: string | null;
  followers: number | null;
  likes: number | null;
  videos: number | null;
}

export async function tiktokProfile(
  accessToken: string,
  fetchImpl: typeof fetch = fetch,
): Promise<TiktokProfile> {
  // « username » demanderait la portée user.info.profile : on s'en tient aux portées accordées.
  const fields = "open_id,display_name,follower_count,likes_count,video_count";
  const data = await read<{ user: Record<string, string | number | undefined> }>(
    await fetchImpl(`${API}/user/info/?fields=${fields}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    }),
    "profil",
  );
  const user = data.user ?? {};
  const num = (v: unknown) => (typeof v === "number" ? v : null);
  return {
    openId: String(user.open_id ?? ""),
    username: typeof user.username === "string" ? user.username : null,
    displayName: typeof user.display_name === "string" ? user.display_name : null,
    followers: num(user.follower_count),
    likes: num(user.likes_count),
    videos: num(user.video_count),
  };
}

export interface CreatorInfo {
  nickname: string;
  username: string;
  avatarUrl: string | null;
  privacyOptions: string[];
  commentDisabled: boolean;
  duetDisabled: boolean;
  stitchDisabled: boolean;
  maxDurationS: number;
}

/** Informations du créateur, à afficher avant chaque publication (exigence de TikTok). */
export async function tiktokCreatorInfo(
  accessToken: string,
  fetchImpl: typeof fetch = fetch,
): Promise<CreatorInfo> {
  const data = await read<{
    creator_nickname: string;
    creator_username: string;
    creator_avatar_url?: string;
    privacy_level_options: string[];
    comment_disabled: boolean;
    duet_disabled: boolean;
    stitch_disabled: boolean;
    max_video_post_duration_sec: number;
  }>(
    await fetchImpl(`${API}/post/publish/creator_info/query/`, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json; charset=UTF-8" },
    }),
    "informations du créateur",
  );
  return {
    nickname: data.creator_nickname,
    username: data.creator_username,
    avatarUrl: data.creator_avatar_url ?? null,
    privacyOptions: data.privacy_level_options ?? [],
    commentDisabled: Boolean(data.comment_disabled),
    duetDisabled: Boolean(data.duet_disabled),
    stitchDisabled: Boolean(data.stitch_disabled),
    maxDurationS: data.max_video_post_duration_sec ?? 60,
  };
}

export interface TiktokPostOptions {
  title: string;
  privacy: string;
  allowComments: boolean;
  allowDuet: boolean;
  allowStitch: boolean;
  /** La vidéo fait la promotion de la marque du créateur (étiquette « Contenu promotionnel »). */
  promoteOwnBrand: boolean;
}

/** Lance la publication : TikTok télécharge la vidéo depuis videoUrl (domaine vérifié culinova.fr). */
export async function tiktokInitPost(
  accessToken: string,
  videoUrl: string,
  options: TiktokPostOptions,
  fetchImpl: typeof fetch = fetch,
): Promise<string> {
  const data = await read<{ publish_id: string }>(
    await fetchImpl(`${API}/post/publish/video/init/`, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json; charset=UTF-8" },
      body: JSON.stringify({
        post_info: {
          title: options.title.slice(0, 2200),
          privacy_level: options.privacy,
          disable_comment: !options.allowComments,
          disable_duet: !options.allowDuet,
          disable_stitch: !options.allowStitch,
          // Obligatoire : pas de partenariat rémunéré ; marque propre si l'administrateur le coche.
          brand_content_toggle: false,
          brand_organic_toggle: options.promoteOwnBrand,
          // Les visuels sont générés par IA : étiquette « générée par IA » de TikTok.
          is_aigc: true,
        },
        source_info: { source: "PULL_FROM_URL", video_url: videoUrl },
      }),
    }),
    "lancement de la publication",
  );
  return data.publish_id;
}

/** État : PROCESSING_DOWNLOAD, PROCESSING_UPLOAD, SEND_TO_USER_INBOX, PUBLISH_COMPLETE ou FAILED. */
export async function tiktokPostStatus(
  accessToken: string,
  publishId: string,
  fetchImpl: typeof fetch = fetch,
): Promise<{ status: string; failReason: string | null; postId: string | null }> {
  const data = await read<{
    status: string;
    fail_reason?: string;
    publicaly_available_post_id?: Array<string | number>;
  }>(
    await fetchImpl(`${API}/post/publish/status/fetch/`, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json; charset=UTF-8" },
      body: JSON.stringify({ publish_id: publishId }),
    }),
    "état de la publication",
  );
  const postId = data.publicaly_available_post_id?.[0];
  return {
    status: data.status,
    failReason: data.fail_reason ?? null,
    postId: postId === undefined ? null : String(postId),
  };
}

export interface TiktokVideoStats {
  id: string;
  title: string | null;
  createdAt: Date | null;
  shareUrl: string | null;
  metrics: PostMetrics;
}

/** Dernières vidéos du compte avec leurs compteurs (vues, j'aime, commentaires, partages). */
export async function tiktokVideoList(
  accessToken: string,
  fetchImpl: typeof fetch = fetch,
): Promise<TiktokVideoStats[]> {
  const fields = "id,title,create_time,share_url,view_count,like_count,comment_count,share_count";
  const data = await read<{ videos?: Array<Record<string, string | number | undefined>> }>(
    await fetchImpl(`${API}/video/list/?fields=${fields}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json; charset=UTF-8" },
      body: JSON.stringify({ max_count: 20 }),
    }),
    "liste des vidéos",
  );
  const num = (v: unknown) => (typeof v === "number" ? v : null);
  return (data.videos ?? []).map((v) => ({
    id: String(v.id),
    title: typeof v.title === "string" ? v.title : null,
    createdAt: typeof v.create_time === "number" ? new Date(v.create_time * 1000) : null,
    shareUrl: typeof v.share_url === "string" ? v.share_url : null,
    metrics: {
      views: num(v.view_count),
      reach: null,
      likes: num(v.like_count),
      comments: num(v.comment_count),
      shares: num(v.share_count),
      saves: null,
    },
  }));
}
