/** Image d'un carrousel téléchargée par Instagram au moment de la publication (lien signé de 6 h). */
import * as s from "@culinova/db/schema";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/server/db";
import { verifySlideSignature } from "@/server/publishing";
import { slideKey } from "@/server/social/carousels";
import { createVideoStorage, slideResponse } from "@/server/social/video-storage";

export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ id: string; n: string }> }) {
  const { id, n } = await params;
  const url = new URL(request.url);
  const slide = Number(n);
  if (
    !z.uuid().safeParse(id).success ||
    !Number.isInteger(slide) ||
    !verifySlideSignature(id, slide, url.searchParams.get("expire"), url.searchParams.get("signature"))
  ) {
    return new Response("Lien invalide ou expiré", { status: 403 });
  }
  const [row] = await getDb()
    .select({ prefix: s.recipeCarousels.storagePrefix, count: s.recipeCarousels.slideCount })
    .from(s.recipeCarousels)
    .innerJoin(s.recipes, eq(s.recipes.id, s.recipeCarousels.recipeId))
    .innerJoin(s.users, eq(s.users.id, s.recipes.ownerId))
    .where(
      and(eq(s.recipeCarousels.id, id), eq(s.users.role, "admin"), eq(s.recipeCarousels.status, "ready")),
    );
  if (!row || slide < 1 || slide > row.count) return new Response("Introuvable", { status: 404 });
  return (
    (await slideResponse(createVideoStorage(), slideKey(row.prefix, slide))) ??
    new Response("Introuvable", { status: 404 })
  );
}
