/**
 * Vidéos de l'agent de publication (dossier agent/).
 * GET  : vidéos à fabriquer (ou ?recette=<id> pour en refaire une) : textes à l'écran et photo 9:16.
 * POST : annonce d'une vidéo fabriquée { recipeId, versionId, imageId, durationS, width, height, sizeBytes }
 *        → { videoId, upload: { url, method, headers } } pour envoyer le fichier.
 * En-tête obligatoire : Authorization: Bearer <AGENT_API_KEY>.
 */
import { z } from "zod";
import { appUrl } from "@/server/auth";
import { getDb } from "@/server/db";
import { refuseAgent } from "@/server/social/agent-route";
import { VIDEO_MAX_BYTES } from "@/server/social/video-storage";
import { registerVideo, videoJobs } from "@/server/social/videos";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const refused = refuseAgent(request);
  if (refused) return refused;
  const recipeId = new URL(request.url).searchParams.get("recette");
  if (recipeId && !z.uuid().safeParse(recipeId).success) {
    return Response.json({ error: "invalid_recipe" }, { status: 400 });
  }
  const videos = await videoJobs(getDb(), appUrl(), recipeId ? { recipeId } : {});
  return Response.json({ videos }, { headers: { "Cache-Control": "no-store" } });
}

const registrationSchema = z.object({
  recipeId: z.uuid(),
  versionId: z.uuid(),
  imageId: z.uuid().nullish(),
  durationS: z.number().positive().max(600),
  width: z.int().positive().max(4096),
  height: z.int().positive().max(4096),
  sizeBytes: z.int().positive().max(VIDEO_MAX_BYTES),
});

export async function POST(request: Request) {
  const refused = refuseAgent(request);
  if (refused) return refused;
  const parsed = registrationSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "invalid_body" }, { status: 400 });
  let result: Awaited<ReturnType<typeof registerVideo>>;
  try {
    result = await registerVideo(getDb(), parsed.data);
  } catch (error) {
    // Détail renvoyé à l'agent (porte protégée par sa clé) pour comprendre l'échec.
    console.error("registerVideo", error);
    const detail = error instanceof Error ? error.message : String(error);
    return Response.json({ error: "storage_error", detail: detail.slice(0, 500) }, { status: 500 });
  }
  if (!result.ok) return Response.json({ error: result.reason }, { status: 404 });
  return Response.json({ videoId: result.videoId, upload: result.upload });
}
