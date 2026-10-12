/**
 * Photo d'une recette (image HD ou recadrage), servie seulement à sa propriétaire.
 * `?telecharger=1` propose le fichier au téléchargement.
 */
import * as s from "@culinova/db/schema";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/server/db";
import { createImageStorage } from "@/server/images/storage";
import { getCurrentSession } from "@/server/session";

export const dynamic = "force-dynamic";

function slug(text: string): string {
  return (
    text
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 60) || "recette"
  );
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getCurrentSession();
  if (!session) return new Response("Non connecté", { status: 401 });
  if (!z.uuid().safeParse(id).success) return new Response("Introuvable", { status: 404 });

  const [row] = await getDb()
    .select({ key: s.recipeImages.storageKey, format: s.recipeImages.format, name: s.recipeVersions.name })
    .from(s.recipeImages)
    .innerJoin(s.recipeVersions, eq(s.recipeVersions.id, s.recipeImages.recipeVersionId))
    .innerJoin(s.recipes, eq(s.recipes.id, s.recipeVersions.recipeId))
    .where(and(eq(s.recipeImages.id, id), eq(s.recipes.ownerId, session.user.id)));
  if (!row?.key) return new Response("Introuvable", { status: 404 });

  const bytes = await createImageStorage().get(row.key);
  if (!bytes) return new Response("Introuvable", { status: 404 });
  const download = new URL(request.url).searchParams.get("telecharger") === "1";
  const format = row.format === "source" ? "hd" : row.format.replace(":", "x");
  return new Response(bytes as unknown as BodyInit, {
    headers: {
      "Content-Type": "image/jpeg",
      "Cache-Control": "private, max-age=31536000, immutable",
      ...(download
        ? { "Content-Disposition": `attachment; filename="${slug(row.name)}-${format}.jpg"` }
        : {}),
    },
  });
}
