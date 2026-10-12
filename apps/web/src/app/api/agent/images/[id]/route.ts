/** Photo d'une recette de l'administrateur, servie à l'agent par un lien signé valable 1 h. */
import * as s from "@culinova/db/schema";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/server/db";
import { createImageStorage } from "@/server/images/storage";
import { verifyImageSignature } from "@/server/publishing";

export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const url = new URL(request.url);
  if (
    !z.uuid().safeParse(id).success ||
    !verifyImageSignature(id, url.searchParams.get("expire"), url.searchParams.get("signature"))
  ) {
    return new Response("Lien invalide ou expiré", { status: 403 });
  }
  const [row] = await getDb()
    .select({ key: s.recipeImages.storageKey, format: s.recipeImages.format })
    .from(s.recipeImages)
    .innerJoin(s.recipeVersions, eq(s.recipeVersions.id, s.recipeImages.recipeVersionId))
    .innerJoin(s.recipes, eq(s.recipes.id, s.recipeVersions.recipeId))
    .innerJoin(s.users, eq(s.users.id, s.recipes.ownerId))
    .where(and(eq(s.recipeImages.id, id), eq(s.users.role, "admin")));
  if (!row?.key) return new Response("Introuvable", { status: 404 });
  const bytes = await createImageStorage().get(row.key);
  if (!bytes) return new Response("Introuvable", { status: 404 });
  return new Response(bytes as unknown as BodyInit, {
    headers: {
      "Content-Type": "image/jpeg",
      "Cache-Control": "private, max-age=3600",
      "Content-Disposition": `inline; filename="culinova-${row.format.replace(":", "x")}.jpg"`,
    },
  });
}
