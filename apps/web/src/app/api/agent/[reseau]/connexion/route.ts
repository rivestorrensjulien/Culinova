/** Début de la connexion d'un compte Instagram ou TikTok (administration › Réseaux sociaux). */
import { cookies } from "next/headers";
import { socialSetup } from "@/server/social/accounts";
import {
  authorizeUrl,
  isFullAdmin,
  isSocialPlatform,
  newState,
  OAUTH_COOKIE,
  OAUTH_COOKIE_MAX_AGE_S,
} from "@/server/social/oauth";
import { getCurrentSession } from "@/server/session";

export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ reseau: string }> }) {
  const { reseau } = await params;
  const back = new URL("/admin/reseaux", request.url);
  if (!isSocialPlatform(reseau)) return new Response("Introuvable", { status: 404 });
  if (!isFullAdmin(await getCurrentSession()))
    return Response.redirect(new URL("/connexion", request.url), 303);
  const setup = socialSetup();
  if (!setup.tokenKey || !setup[reseau]) {
    back.searchParams.set("erreur", "configuration");
    return Response.redirect(back, 303);
  }
  const { state, cookie } = newState(reseau);
  (await cookies()).set(OAUTH_COOKIE, cookie, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/api/agent",
    maxAge: OAUTH_COOKIE_MAX_AGE_S,
  });
  return Response.redirect(authorizeUrl(reseau, state), 303);
}
