/** Retour de Meta ou de TikTok après l'autorisation : le compte est relié, jetons chiffrés. */
import { cookies } from "next/headers";
import { getDb } from "@/server/db";
import {
  completeConnection,
  isFullAdmin,
  isSocialPlatform,
  OAUTH_COOKIE,
  stateMatches,
} from "@/server/social/oauth";
import { getCurrentSession } from "@/server/session";

export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ reseau: string }> }) {
  const { reseau } = await params;
  const url = new URL(request.url);
  const back = new URL("/admin/reseaux", request.url);
  if (!isSocialPlatform(reseau)) return new Response("Introuvable", { status: 404 });
  const session = await getCurrentSession();
  if (!isFullAdmin(session)) return Response.redirect(new URL("/connexion", request.url), 303);

  const jar = await cookies();
  const cookie = jar.get(OAUTH_COOKIE)?.value;
  jar.delete({ name: OAUTH_COOKIE, path: "/api/agent" });
  const code = url.searchParams.get("code");
  if (!stateMatches(cookie, reseau, url.searchParams.get("state")) || !code) {
    back.searchParams.set("erreur", url.searchParams.get("error") ? "refus" : "etat");
    return Response.redirect(back, 303);
  }
  try {
    await completeConnection(getDb(), session.user.id, reseau, code);
    back.searchParams.set("relie", reseau);
  } catch (error) {
    console.error(`Connexion ${reseau} impossible`, error);
    back.searchParams.set("erreur", "echange");
    back.searchParams.set("detail", (error instanceof Error ? error.message : String(error)).slice(0, 200));
  }
  return Response.redirect(back, 303);
}
