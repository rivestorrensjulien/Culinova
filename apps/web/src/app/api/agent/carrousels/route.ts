/**
 * Carrousels Instagram de l'agent de publication (dossier agent/).
 * GET  : carrousels à fabriquer (ou ?recette=<id>) : nom, ingrédients pesés, étapes, photo 4:5.
 * POST : annonce d'un carrousel fabriqué { recipeId, versionId, imageId, slideCount }
 *        → { carouselId, uploads: [{ url, method, headers }] } (une image JPEG par lien).
 * En-tête obligatoire : Authorization: Bearer <AGENT_API_KEY>.
 */
import { z } from "zod";
import { appUrl } from "@/server/auth";
import { getDb } from "@/server/db";
import { refuseAgent } from "@/server/social/agent-route";
import { carouselJobs, MAX_SLIDES, registerCarousel } from "@/server/social/carousels";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const refused = refuseAgent(request);
  if (refused) return refused;
  const recipeId = new URL(request.url).searchParams.get("recette");
  if (recipeId && !z.uuid().safeParse(recipeId).success) {
    return Response.json({ error: "invalid_recipe" }, { status: 400 });
  }
  const carousels = await carouselJobs(getDb(), appUrl(), recipeId ? { recipeId } : {});
  return Response.json({ carousels }, { headers: { "Cache-Control": "no-store" } });
}

const registrationSchema = z.object({
  recipeId: z.uuid(),
  versionId: z.uuid(),
  imageId: z.uuid().nullish(),
  slideCount: z.int().min(2).max(MAX_SLIDES),
});

export async function POST(request: Request) {
  const refused = refuseAgent(request);
  if (refused) return refused;
  const parsed = registrationSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "invalid_body" }, { status: 400 });
  let result: Awaited<ReturnType<typeof registerCarousel>>;
  try {
    result = await registerCarousel(getDb(), { ...parsed.data, imageId: parsed.data.imageId ?? null });
  } catch (error) {
    // Détail renvoyé à l'agent (porte protégée par sa clé) pour comprendre l'échec.
    console.error("registerCarousel", error);
    const detail = error instanceof Error ? error.message : String(error);
    return Response.json({ error: "storage_error", detail: detail.slice(0, 500) }, { status: 500 });
  }
  if (!result.ok) return Response.json({ error: result.reason }, { status: 404 });
  return Response.json({ carouselId: result.carouselId, uploads: result.uploads });
}
