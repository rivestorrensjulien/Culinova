/**
 * Envoi du fichier vidéo par l'agent quand le stockage est local (développement).
 * En production, l'agent envoie directement à Supabase par un lien signé.
 */
import { z } from "zod";
import { getDb } from "@/server/db";
import { refuseAgent } from "@/server/social/agent-route";
import { createVideoStorage, VIDEO_MAX_BYTES } from "@/server/social/video-storage";
import { videoById } from "@/server/social/videos";

export const dynamic = "force-dynamic";

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const refused = refuseAgent(request);
  if (refused) return refused;
  const { id } = await params;
  const storage = createVideoStorage();
  if (storage.kind !== "local") return Response.json({ error: "use_signed_upload" }, { status: 409 });
  const video = z.uuid().safeParse(id).success ? await videoById(getDb(), id) : null;
  if (!video || video.status !== "uploading") return Response.json({ error: "not_found" }, { status: 404 });
  const bytes = new Uint8Array(await request.arrayBuffer());
  if (bytes.length === 0 || bytes.length > VIDEO_MAX_BYTES) {
    return Response.json({ error: "invalid_size" }, { status: 400 });
  }
  await storage.put(video.storageKey, bytes);
  return Response.json({ ok: true });
}
