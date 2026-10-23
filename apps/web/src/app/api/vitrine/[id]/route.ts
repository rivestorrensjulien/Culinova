/**
 * Photos servies sans connexion : les recadrages 4:5 de la vitrine de la page d'accueil, et
 * les recadrages de la photo des recettes qui ont une page publique (liens des réseaux).
 */
import { z } from "zod";
import { getDb } from "@/server/db";
import { createImageStorage } from "@/server/images/storage";
import { publicImageKey } from "@/server/public-recipes";
import { getShowcase } from "@/server/showcase";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) return new Response("Introuvable", { status: 404 });
  const db = getDb();
  const storageKey =
    (await getShowcase(db)).find((i) => i.imageId === id)?.storageKey ?? (await publicImageKey(db, id));
  if (!storageKey) return new Response("Introuvable", { status: 404 });
  const bytes = await createImageStorage().get(storageKey);
  if (!bytes) return new Response("Introuvable", { status: 404 });
  return new Response(bytes as unknown as BodyInit, {
    headers: {
      "Content-Type": "image/jpeg",
      // Une photo retirée de la vitrine (ou d'une page publique) disparaît des caches partagés en une heure au plus.
      "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400",
    },
  });
}
