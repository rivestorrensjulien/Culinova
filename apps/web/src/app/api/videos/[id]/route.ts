/** Vidéo d'une recette, lue par sa propriétaire (lecteur de l'encart de publication, lecture partielle). */
import * as s from "@culinova/db/schema";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/server/db";
import { getCurrentSession } from "@/server/session";
import { createVideoStorage, videoResponse } from "@/server/social/video-storage";

export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getCurrentSession();
  if (!session) return new Response("Non connecté", { status: 401 });
  if (!z.uuid().safeParse(id).success) return new Response("Introuvable", { status: 404 });
  const [row] = await getDb()
    .select({ key: s.recipeVideos.storageKey })
    .from(s.recipeVideos)
    .innerJoin(s.recipes, eq(s.recipes.id, s.recipeVideos.recipeId))
    .where(
      and(
        eq(s.recipeVideos.id, id),
        eq(s.recipes.ownerId, session.user.id),
        eq(s.recipeVideos.status, "ready"),
      ),
    );
  if (!row) return new Response("Introuvable", { status: 404 });
  const source = await createVideoStorage().read(row.key, request.headers.get("range"));
  if (!source) return new Response("Introuvable", { status: 404 });
  const download = new URL(request.url).searchParams.get("telecharger") === "1";
  return videoResponse(source, {
    "Cache-Control": "private, max-age=3600",
    ...(download ? { "Content-Disposition": 'attachment; filename="culinova-video.mp4"' } : {}),
  });
}
