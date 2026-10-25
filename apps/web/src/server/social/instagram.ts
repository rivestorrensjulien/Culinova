/**
 * API Instagram avec connexion Instagram (application Meta « Culinova Agent »).
 * Autorisations : instagram_business_basic, instagram_business_content_publish,
 * instagram_business_manage_insights, instagram_business_manage_comments et
 * instagram_business_manage_messages (« Commente RECETTE » : lien envoyé en message privé).
 * Variables : INSTAGRAM_APP_ID, INSTAGRAM_APP_SECRET.
 */
type Env = Record<string, string | undefined>;

export const INSTAGRAM_SCOPES = [
  "instagram_business_basic",
  "instagram_business_content_publish",
  "instagram_business_manage_insights",
  "instagram_business_manage_comments",
  "instagram_business_manage_messages",
] as const;
/** Autorisations nécessaires au « Commente RECETTE » (compte à relier à nouveau sinon). */
export const COMMENT_REPLY_SCOPES = [
  "instagram_business_manage_comments",
  "instagram_business_manage_messages",
] as const;
const GRAPH = "https://graph.instagram.com/v23.0";

export class SocialApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "SocialApiError";
  }
}

export function instagramConfig(env: Env = process.env) {
  const appId = env.INSTAGRAM_APP_ID?.trim();
  const secret = env.INSTAGRAM_APP_SECRET?.trim();
  return appId && secret ? { appId, secret } : null;
}

type GraphBody<T> = T & { error?: { message?: string } | string; error_message?: string };

async function json<T>(response: Response, what: string): Promise<T> {
  const body = (await response.json().catch(() => null)) as GraphBody<T> | null;
  if (!response.ok || !body) {
    const error = body?.error as { message?: string } | string | undefined;
    const detail = typeof error === "object" ? error.message : (body?.error_message ?? error ?? "");
    throw new SocialApiError(`Instagram · ${what} : ${detail || response.status}`, response.status);
  }
  return body;
}

export function instagramAuthorizeUrl(state: string, redirectUri: string, env: Env = process.env): string {
  const config = instagramConfig(env);
  if (!config) throw new Error("INSTAGRAM_APP_ID et INSTAGRAM_APP_SECRET manquants.");
  const params = new URLSearchParams({
    client_id: config.appId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: INSTAGRAM_SCOPES.join(","),
    state,
    enable_fb_login: "0",
    force_reauth: "true",
  });
  return `https://www.instagram.com/oauth/authorize?${params}`;
}

export interface InstagramToken {
  accessToken: string;
  userId: string;
  expiresAt: Date;
  /** Autorisations accordées par la personne (vide si Instagram ne les renvoie pas). */
  scopes: string[];
}

/** Code d'autorisation → jeton de courte durée → jeton de 60 jours. */
export async function instagramExchangeCode(
  code: string,
  redirectUri: string,
  fetchImpl: typeof fetch = fetch,
  env: Env = process.env,
  now = new Date(),
): Promise<InstagramToken> {
  const config = instagramConfig(env);
  if (!config) throw new Error("INSTAGRAM_APP_ID et INSTAGRAM_APP_SECRET manquants.");
  const short = await json<{
    access_token?: string;
    user_id?: string | number;
    permissions?: string | string[];
    data?: Array<{ access_token: string; user_id: string | number; permissions?: string | string[] }>;
  }>(
    await fetchImpl("https://api.instagram.com/oauth/access_token", {
      method: "POST",
      body: new URLSearchParams({
        client_id: config.appId,
        client_secret: config.secret,
        grant_type: "authorization_code",
        redirect_uri: redirectUri,
        code: code.replace(/#_$/, ""),
      }),
    }),
    "échange du code",
  );
  const first = short.data?.[0] ?? short;
  if (!first.access_token || first.user_id === undefined) {
    throw new SocialApiError("Instagram · échange du code : réponse incomplète", 502);
  }
  const long = await json<{ access_token: string; expires_in: number }>(
    await fetchImpl(
      `https://graph.instagram.com/access_token?${new URLSearchParams({
        grant_type: "ig_exchange_token",
        client_secret: config.secret,
        access_token: first.access_token,
      })}`,
    ),
    "jeton longue durée",
  );
  const permissions = first.permissions ?? [];
  return {
    accessToken: long.access_token,
    userId: String(first.user_id),
    expiresAt: new Date(now.getTime() + long.expires_in * 1000),
    scopes: (Array.isArray(permissions) ? permissions : permissions.split(","))
      .map((p) => p.trim())
      .filter(Boolean),
  };
}

/** Prolonge un jeton de 60 jours (possible dès qu'il a plus de 24 h). */
export async function instagramRefresh(
  accessToken: string,
  fetchImpl: typeof fetch = fetch,
  now = new Date(),
): Promise<{ accessToken: string; expiresAt: Date }> {
  const body = await json<{ access_token: string; expires_in: number }>(
    await fetchImpl(
      `https://graph.instagram.com/refresh_access_token?${new URLSearchParams({
        grant_type: "ig_refresh_token",
        access_token: accessToken,
      })}`,
    ),
    "renouvellement du jeton",
  );
  return { accessToken: body.access_token, expiresAt: new Date(now.getTime() + body.expires_in * 1000) };
}

export interface InstagramProfile {
  userId: string;
  username: string;
  followers: number | null;
  posts: number | null;
}

export async function instagramProfile(
  accessToken: string,
  fetchImpl: typeof fetch = fetch,
): Promise<InstagramProfile> {
  const body = await json<{
    user_id?: string | number;
    id?: string;
    username: string;
    followers_count?: number;
    media_count?: number;
  }>(
    await fetchImpl(
      `${GRAPH}/me?${new URLSearchParams({ fields: "user_id,username,followers_count,media_count", access_token: accessToken })}`,
    ),
    "profil",
  );
  return {
    userId: String(body.user_id ?? body.id ?? ""),
    username: body.username,
    followers: body.followers_count ?? null,
    posts: body.media_count ?? null,
  };
}

/** Crée le conteneur d'un Reel (Instagram télécharge la vidéo depuis videoUrl). */
export async function instagramCreateReel(
  accessToken: string,
  userId: string,
  input: { videoUrl: string; caption: string },
  fetchImpl: typeof fetch = fetch,
): Promise<string> {
  const body = await json<{ id: string }>(
    await fetchImpl(`${GRAPH}/${userId}/media`, {
      method: "POST",
      body: new URLSearchParams({
        media_type: "REELS",
        video_url: input.videoUrl,
        caption: input.caption,
        share_to_feed: "true",
        access_token: accessToken,
      }),
    }),
    "création du Reel",
  );
  return body.id;
}

/** Conteneur d'une photo (seule, ou élément d'un carrousel). Instagram n'accepte que le JPEG. */
export async function instagramCreateImage(
  accessToken: string,
  userId: string,
  input: { imageUrl: string; caption?: string; carouselItem?: boolean },
  fetchImpl: typeof fetch = fetch,
): Promise<string> {
  const params = new URLSearchParams({ image_url: input.imageUrl, access_token: accessToken });
  if (input.carouselItem) params.set("is_carousel_item", "true");
  else if (input.caption) params.set("caption", input.caption);
  const body = await json<{ id: string }>(
    await fetchImpl(`${GRAPH}/${userId}/media`, { method: "POST", body: params }),
    input.carouselItem ? "image du carrousel" : "création de la photo",
  );
  return body.id;
}

/** Conteneur d'un carrousel (2 à 10 éléments déjà créés). */
export async function instagramCreateCarousel(
  accessToken: string,
  userId: string,
  input: { children: string[]; caption: string },
  fetchImpl: typeof fetch = fetch,
): Promise<string> {
  const body = await json<{ id: string }>(
    await fetchImpl(`${GRAPH}/${userId}/media`, {
      method: "POST",
      body: new URLSearchParams({
        media_type: "CAROUSEL",
        children: input.children.join(","),
        caption: input.caption,
        access_token: accessToken,
      }),
    }),
    "création du carrousel",
  );
  return body.id;
}

/** État du conteneur : IN_PROGRESS, FINISHED, ERROR, EXPIRED ou PUBLISHED. */
export async function instagramContainerStatus(
  accessToken: string,
  containerId: string,
  fetchImpl: typeof fetch = fetch,
): Promise<{ code: string; detail: string | null }> {
  const body = await json<{ status_code?: string; status?: string }>(
    await fetchImpl(
      `${GRAPH}/${containerId}?${new URLSearchParams({ fields: "status_code,status", access_token: accessToken })}`,
    ),
    "état du Reel",
  );
  return { code: body.status_code ?? "IN_PROGRESS", detail: body.status ?? null };
}

export async function instagramPublish(
  accessToken: string,
  userId: string,
  containerId: string,
  fetchImpl: typeof fetch = fetch,
): Promise<{ mediaId: string; permalink: string | null }> {
  const body = await json<{ id: string }>(
    await fetchImpl(`${GRAPH}/${userId}/media_publish`, {
      method: "POST",
      body: new URLSearchParams({ creation_id: containerId, access_token: accessToken }),
    }),
    "publication du Reel",
  );
  const media: { permalink?: string } = await fetchImpl(
    `${GRAPH}/${body.id}?${new URLSearchParams({ fields: "permalink", access_token: accessToken })}`,
  )
    .then((r) => (r.ok ? (r.json() as Promise<{ permalink?: string }>) : {}))
    .catch(() => ({}));
  return { mediaId: body.id, permalink: media.permalink ?? null };
}

export interface PostMetrics {
  views: number | null;
  reach: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  saves: number | null;
}

/** Statistiques d'un Reel publié. */
export async function instagramMediaInsights(
  accessToken: string,
  mediaId: string,
  fetchImpl: typeof fetch = fetch,
): Promise<{ metrics: PostMetrics; raw: unknown }> {
  const body = await json<{
    data: Array<{ name: string; values?: Array<{ value: number }>; total_value?: { value: number } }>;
  }>(
    await fetchImpl(
      `${GRAPH}/${mediaId}/insights?${new URLSearchParams({
        metric: "views,reach,likes,comments,shares,saved",
        access_token: accessToken,
      })}`,
    ),
    "statistiques du Reel",
  );
  const value = (name: string) => {
    const metric = body.data.find((m) => m.name === name);
    return metric?.values?.[0]?.value ?? metric?.total_value?.value ?? null;
  };
  return {
    metrics: {
      views: value("views"),
      reach: value("reach"),
      likes: value("likes"),
      comments: value("comments"),
      shares: value("shares"),
      saves: value("saved"),
    },
    raw: body.data,
  };
}

export interface InstagramComment {
  id: string;
  text: string;
  timestamp: string;
  username: string | null;
  /** Identifiant Instagram de l'auteur (pour ne jamais se répondre à soi-même). */
  fromId: string | null;
}

/** Commentaires d'une publication (les plus récents d'abord, 100 au plus). */
export async function instagramComments(
  accessToken: string,
  mediaId: string,
  fetchImpl: typeof fetch = fetch,
): Promise<InstagramComment[]> {
  const body = await json<{
    data: Array<{
      id: string;
      text?: string;
      timestamp?: string;
      username?: string;
      from?: { id?: string; username?: string };
    }>;
  }>(
    await fetchImpl(
      `${GRAPH}/${mediaId}/comments?${new URLSearchParams({
        fields: "id,text,timestamp,username,from",
        limit: "100",
        access_token: accessToken,
      })}`,
    ),
    "commentaires",
  );
  return body.data.map((c) => ({
    id: c.id,
    text: c.text ?? "",
    timestamp: c.timestamp ?? new Date(0).toISOString(),
    username: c.username ?? c.from?.username ?? null,
    fromId: c.from?.id ?? null,
  }));
}

/** Réponse privée à un commentaire (une seule par commentaire, dans les 7 jours). */
export async function instagramPrivateReply(
  accessToken: string,
  accountId: string,
  commentId: string,
  text: string,
  fetchImpl: typeof fetch = fetch,
): Promise<string | null> {
  const body = await json<{ message_id?: string }>(
    await fetchImpl(`${GRAPH}/${accountId}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ recipient: { comment_id: commentId }, message: { text } }),
    }),
    "message privé",
  );
  return body.message_id ?? null;
}

/** Réponse publique sous le commentaire (« Envoyé en message privé »). */
export async function instagramReplyToComment(
  accessToken: string,
  commentId: string,
  text: string,
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  await json<{ id?: string }>(
    await fetchImpl(`${GRAPH}/${commentId}/replies`, {
      method: "POST",
      body: new URLSearchParams({ message: text, access_token: accessToken }),
    }),
    "réponse au commentaire",
  );
}

/** Nombre de commentaires affiché par Instagram sous une publication (pour le diagnostic). */
export async function instagramCommentsCount(
  accessToken: string,
  mediaId: string,
  fetchImpl: typeof fetch = fetch,
): Promise<number | null> {
  const body = await json<{ comments_count?: number }>(
    await fetchImpl(
      `${GRAPH}/${mediaId}?${new URLSearchParams({ fields: "comments_count", access_token: accessToken })}`,
    ),
    "nombre de commentaires",
  );
  return body.comments_count ?? null;
}
