/**
 * API Pinterest v5 (application « Culinova » sur developers.pinterest.com) : connexion OAuth,
 * tableaux, création d'épingles (photo de la recette + lien vers culinova.fr), statistiques.
 * Portées : boards:read, pins:read, pins:write, user_accounts:read.
 * Variables : PINTEREST_APP_ID, PINTEREST_APP_SECRET ; PINTEREST_API_URL facultative
 * (https://api-sandbox.pinterest.com tant que l'application est en accès d'essai).
 * En accès d'essai (« Trial »), les épingles créées ne sont visibles que par le compte qui les crée :
 * il faut l'accès « Standard » (vidéo de démonstration) pour qu'elles soient publiques.
 */
import { type PostMetrics, SocialApiError } from "./instagram";

type Env = Record<string, string | undefined>;

export const PINTEREST_SCOPES = ["boards:read", "pins:read", "pins:write", "user_accounts:read"] as const;
export const PIN_TITLE_MAX = 100;
export const PIN_DESCRIPTION_MAX = 800;

export function pinterestConfig(env: Env = process.env) {
  const appId = env.PINTEREST_APP_ID?.trim();
  const secret = env.PINTEREST_APP_SECRET?.trim();
  const api = (env.PINTEREST_API_URL?.trim() || "https://api.pinterest.com").replace(/\/$/, "");
  return appId && secret ? { appId, secret, api: `${api}/v5` } : null;
}

function config(env: Env) {
  const value = pinterestConfig(env);
  if (!value) throw new Error("PINTEREST_APP_ID et PINTEREST_APP_SECRET manquants.");
  return value;
}

type PinterestError = { code?: number; message?: string };

async function read<T>(response: Response, what: string): Promise<T> {
  const body = (await response.json().catch(() => null)) as (T & PinterestError) | null;
  if (!response.ok || !body) {
    const detail = body?.message || String(response.status);
    throw new SocialApiError(`Pinterest · ${what} : ${detail}`, response.status);
  }
  return body;
}

export function pinterestAuthorizeUrl(state: string, redirectUri: string, env: Env = process.env): string {
  const params = new URLSearchParams({
    client_id: config(env).appId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: PINTEREST_SCOPES.join(","),
    state,
  });
  return `https://www.pinterest.com/oauth/?${params}`;
}

export interface PinterestToken {
  accessToken: string;
  refreshToken: string | null;
  expiresAt: Date;
  refreshExpiresAt: Date | null;
  scopes: string[];
}

type TokenBody = {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  refresh_token_expires_in?: number;
  scope?: string;
};

async function tokenRequest(
  params: Record<string, string>,
  fetchImpl: typeof fetch,
  env: Env,
  now: Date,
): Promise<PinterestToken> {
  const { appId, secret, api } = config(env);
  const body = await read<TokenBody>(
    await fetchImpl(`${api}/oauth/token`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${appId}:${secret}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams(params),
    }),
    "jeton",
  );
  if (!body.access_token) throw new SocialApiError("Pinterest · jeton absent de la réponse", 502);
  return {
    accessToken: body.access_token,
    refreshToken: body.refresh_token ?? params.refresh_token ?? null,
    expiresAt: new Date(now.getTime() + body.expires_in * 1000),
    refreshExpiresAt: body.refresh_token_expires_in
      ? new Date(now.getTime() + body.refresh_token_expires_in * 1000)
      : null,
    scopes: (body.scope ?? "").split(/[ ,]+/).filter(Boolean),
  };
}

export function pinterestExchangeCode(
  code: string,
  redirectUri: string,
  fetchImpl: typeof fetch = fetch,
  env: Env = process.env,
  now = new Date(),
) {
  return tokenRequest(
    { grant_type: "authorization_code", code, redirect_uri: redirectUri },
    fetchImpl,
    env,
    now,
  );
}

export function pinterestRefresh(
  refreshToken: string,
  fetchImpl: typeof fetch = fetch,
  env: Env = process.env,
  now = new Date(),
) {
  return tokenRequest({ grant_type: "refresh_token", refresh_token: refreshToken }, fetchImpl, env, now);
}

export interface PinterestProfile {
  username: string;
  followers: number | null;
  monthlyViews: number | null;
}

export async function pinterestProfile(
  accessToken: string,
  fetchImpl: typeof fetch = fetch,
  env: Env = process.env,
): Promise<PinterestProfile> {
  const body = await read<{ username: string; follower_count?: number; monthly_views?: number }>(
    await fetchImpl(`${config(env).api}/user_account`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    }),
    "profil",
  );
  return {
    username: body.username,
    followers: typeof body.follower_count === "number" ? body.follower_count : null,
    monthlyViews: typeof body.monthly_views === "number" ? body.monthly_views : null,
  };
}

export interface PinterestBoard {
  id: string;
  name: string;
  privacy: string;
}

/** Tableaux du compte (toutes les pages). */
export async function pinterestBoards(
  accessToken: string,
  fetchImpl: typeof fetch = fetch,
  env: Env = process.env,
): Promise<PinterestBoard[]> {
  const boards: PinterestBoard[] = [];
  let bookmark: string | null = null;
  for (let page = 0; page < 10; page++) {
    const query = new URLSearchParams({ page_size: "100", ...(bookmark ? { bookmark } : {}) });
    const body: { items: PinterestBoard[]; bookmark?: string | null } = await read(
      await fetchImpl(`${config(env).api}/boards?${query}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      }),
      "tableaux",
    );
    boards.push(...body.items.map((b) => ({ id: b.id, name: b.name, privacy: b.privacy })));
    bookmark = body.bookmark ?? null;
    if (!bookmark) break;
  }
  return boards;
}

export interface PinInput {
  boardId: string;
  title: string;
  description: string;
  link: string;
  altText: string;
  imageUrl: string;
}

/** Crée l'épingle (Pinterest télécharge la photo depuis le lien signé de culinova.fr). */
export async function pinterestCreatePin(
  accessToken: string,
  pin: PinInput,
  fetchImpl: typeof fetch = fetch,
  env: Env = process.env,
): Promise<{ id: string; url: string }> {
  const body = await read<{ id: string }>(
    await fetchImpl(`${config(env).api}/pins`, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        board_id: pin.boardId,
        title: pin.title.slice(0, PIN_TITLE_MAX),
        description: pin.description.slice(0, PIN_DESCRIPTION_MAX),
        link: pin.link,
        alt_text: pin.altText.slice(0, 500),
        media_source: { source_type: "image_url", url: pin.imageUrl },
      }),
    }),
    "création de l'épingle",
  );
  return { id: body.id, url: `https://www.pinterest.com/pin/${body.id}/` };
}

type MetricName = "IMPRESSION" | "SAVE" | "PIN_CLICK" | "OUTBOUND_CLICK";
type PinAnalytics = { all?: { summary_metrics?: Partial<Record<MetricName, number>> } };

/**
 * Compteurs d'une épingle depuis sa publication (90 jours au plus, limite de Pinterest) : vues et
 * enregistrements ; les clics (vers culinova.fr notamment) restent dans le relevé brut.
 */
export async function pinterestPinMetrics(
  accessToken: string,
  pinId: string,
  since: Date,
  now = new Date(),
  fetchImpl: typeof fetch = fetch,
  env: Env = process.env,
): Promise<{ metrics: PostMetrics; raw: PinAnalytics }> {
  const day = (d: Date) => d.toISOString().slice(0, 10);
  const start = new Date(Math.max(since.getTime(), now.getTime() - 89 * 24 * 3600 * 1000));
  const query = new URLSearchParams({
    start_date: day(start),
    end_date: day(now),
    metric_types: "IMPRESSION,SAVE,PIN_CLICK,OUTBOUND_CLICK",
  });
  const body = await read<PinAnalytics>(
    await fetchImpl(`${config(env).api}/pins/${pinId}/analytics?${query}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    }),
    "statistiques de l'épingle",
  );
  const m = body.all?.summary_metrics ?? {};
  const num = (v: number | undefined) => (typeof v === "number" ? v : null);
  const metrics = {
    views: num(m.IMPRESSION),
    reach: null,
    likes: null,
    comments: null,
    shares: null,
    saves: num(m.SAVE),
  };
  return { metrics, raw: body };
}
