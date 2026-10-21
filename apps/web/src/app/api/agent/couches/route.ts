/**
 * Couches de la vue éclatée d'une recette (agent de publication, format court).
 * GET ?recette=<id>[&nouveau=1] → { layers, cached }.
 * En-tête obligatoire : Authorization: Bearer <AGENT_API_KEY>.
 */
import { createLlmAdapter } from "@culinova/ai";
import { z } from "zod";
import { getDb } from "@/server/db";
import { refuseAgent } from "@/server/social/agent-route";
import { videoLayers } from "@/server/social/scenes";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(request: Request) {
  const refused = refuseAgent(request);
  if (refused) return refused;
  const url = new URL(request.url);
  const recipeId = url.searchParams.get("recette");
  if (!recipeId || !z.uuid().safeParse(recipeId).success) {
    return Response.json({ error: "invalid_recipe" }, { status: 400 });
  }
  const result = await videoLayers(getDb(), createLlmAdapter(process.env, { effort: "medium" }), recipeId, {
    fresh: url.searchParams.get("nouveau") === "1",
  });
  if (!result.ok) {
    const status = result.reason === "not_found" ? 404 : result.reason === "budget" ? 429 : 502;
    return Response.json({ error: result.reason }, { status });
  }
  return Response.json(
    { layers: result.data, cached: result.cached },
    { headers: { "Cache-Control": "no-store" } },
  );
}
