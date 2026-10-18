/**
 * Compte rendu de l'agent après l'envoi d'une vidéo :
 * { status: "ready" } (le fichier doit être arrivé) ou { status: "failed", note }.
 */
import { z } from "zod";
import { getDb } from "@/server/db";
import { refuseAgent } from "@/server/social/agent-route";
import { completeVideo } from "@/server/social/videos";

export const dynamic = "force-dynamic";

const reportSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("ready") }),
  z.object({ status: z.literal("failed"), note: z.string().max(2000) }),
]);

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const refused = refuseAgent(request);
  if (refused) return refused;
  const { id } = await params;
  const parsed = reportSchema.safeParse(await request.json().catch(() => null));
  if (!z.uuid().safeParse(id).success || !parsed.success) {
    return Response.json({ error: "invalid_body" }, { status: 400 });
  }
  const result = await completeVideo(getDb(), id, parsed.data);
  if (!result.ok) {
    return Response.json({ error: result.reason }, { status: result.reason === "not_found" ? 404 : 409 });
  }
  return Response.json({ ok: true });
}
