/** Envoi d'une image de carrousel par l'agent quand le stockage est local (développement). */
import { z } from "zod";
import { getDb } from "@/server/db";
import { refuseAgent } from "@/server/social/agent-route";
import { carouselById, slideKey } from "@/server/social/carousels";
import { createVideoStorage } from "@/server/social/video-storage";

export const dynamic = "force-dynamic";

export async function PUT(request: Request, { params }: { params: Promise<{ id: string; n: string }> }) {
  const refused = refuseAgent(request);
  if (refused) return refused;
  const { id, n } = await params;
  const storage = createVideoStorage();
  if (storage.kind !== "local") return Response.json({ error: "use_signed_upload" }, { status: 409 });
  const carousel = z.uuid().safeParse(id).success ? await carouselById(getDb(), id) : null;
  const slide = Number(n);
  if (
    !carousel ||
    carousel.status !== "uploading" ||
    !Number.isInteger(slide) ||
    slide < 1 ||
    slide > carousel.slideCount
  ) {
    return Response.json({ error: "not_found" }, { status: 404 });
  }
  const bytes = new Uint8Array(await request.arrayBuffer());
  if (bytes.length === 0 || bytes.length > 8 * 1024 * 1024)
    return Response.json({ error: "invalid_size" }, { status: 400 });
  await storage.put(slideKey(carousel.storagePrefix, slide), bytes, "image/jpeg");
  return Response.json({ ok: true });
}
