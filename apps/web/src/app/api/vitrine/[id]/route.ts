/**
 * Photos de la vitrine de la page d'accueil, servies sans connexion : uniquement
 * les recadrages 4:5 des recettes qu'un administrateur a choisi de montrer.
 */
import { z } from "zod";
import { getDb } from "@/server/db";
import { createImageStorage } from "@/server/images/storage";
import { getShowcase } from "@/server/showcase";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) return new Response("Introuvable", { status: 404 });
  const item = (await getShowcase(getDb())).find((i) => i.imageId === id);
  if (!item) return new Response("Introuvable", { status: 404 });
  const bytes = await createImageStorage().get(item.storageKey);
  if (!bytes) return new Response("Introuvable", { status: 404 });
  return new Response(bytes as unknown as BodyInit, {
    headers: {
      "Content-Type": "image/jpeg",
      // Une photo retirée de la vitrine disparaît des caches partagés en une heure au plus.
      "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400",
    },
  });
}
