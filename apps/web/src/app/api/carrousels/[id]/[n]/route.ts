/** Image d'un carrousel, servie à la propriétaire de la recette (aperçu avant publication). */
import * as s from "@culinova/db/schema";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/server/db";
import { getCurrentSession } from "@/server/session";
import { slideKey } from "@/server/social/carousels";
import { createVideoStorage, slideResponse } from "@/server/social/video-storage";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string; n: string }> }) {
  const { id, n } = await params;
  const session = await getCurrentSession();
  if (!session) return new Response("Non connecté", { status: 401 });
  const slide = Number(n);
  if (!z.uuid().safeParse(id).success || !Number.isInteger(slide))
    return new Response("Introuvable", { status: 404 });
  const [row] = await getDb()
    .select({ prefix: s.recipeCarousels.storagePrefix, count: s.recipeCarousels.slideCount })
    .from(s.recipeCarousels)
    .innerJoin(s.recipes, eq(s.recipes.id, s.recipeCarousels.recipeId))
    .where(and(eq(s.recipeCarousels.id, id), eq(s.recipes.ownerId, session.user.id)));
  if (!row || slide < 1 || slide > row.count) return new Response("Introuvable", { status: 404 });
  return (
    (await slideResponse(createVideoStorage(), slideKey(row.prefix, slide))) ??
    new Response("Introuvable", { status: 404 })
  );
}
