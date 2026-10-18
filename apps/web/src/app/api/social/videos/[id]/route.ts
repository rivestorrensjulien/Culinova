/**
 * Vidéo d'une recette de l'administrateur, téléchargée par Instagram ou TikTok au moment
 * de la publication (lien signé valable 6 h, sur le domaine vérifié culinova.fr).
 */
import * as s from "@culinova/db/schema";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/server/db";
import { verifyVideoSignature } from "@/server/publishing";
import { createVideoStorage, videoResponse } from "@/server/social/video-storage";

export const dynamic = "force-dynamic";
// Une vidéo de quelques dizaines de mégaoctets est transmise en continu.
export const maxDuration = 300;

async function serve(request: Request, id: string, head: boolean) {
  const url = new URL(request.url);
  if (
    !z.uuid().safeParse(id).success ||
    !verifyVideoSignature(id, url.searchParams.get("expire"), url.searchParams.get("signature"))
  ) {
    return new Response("Lien invalide ou expiré", { status: 403 });
  }
  const [row] = await getDb()
    .select({ key: s.recipeVideos.storageKey })
    .from(s.recipeVideos)
    .innerJoin(s.recipes, eq(s.recipes.id, s.recipeVideos.recipeId))
    .innerJoin(s.users, eq(s.users.id, s.recipes.ownerId))
    .where(and(eq(s.recipeVideos.id, id), eq(s.users.role, "admin"), eq(s.recipeVideos.status, "ready")));
  if (!row) return new Response("Introuvable", { status: 404 });
  const source = await createVideoStorage().read(row.key, request.headers.get("range"));
  if (!source) return new Response("Introuvable", { status: 404 });
  const response = videoResponse(source, { "Cache-Control": "private, max-age=3600" });
  if (!head) return response;
  await source.body?.cancel().catch(() => {});
  return new Response(null, { status: response.status, headers: response.headers });
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return serve(request, (await params).id, false);
}

export async function HEAD(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return serve(request, (await params).id, true);
}
