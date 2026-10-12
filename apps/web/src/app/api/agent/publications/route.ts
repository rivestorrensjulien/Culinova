/**
 * Porte de l'agent de publication.
 * GET  : recettes « à publier » (ou ?recette=<id>) avec textes Instagram/TikTok et liens photo (1 h).
 * POST : compte rendu { recipeId, platform, status: "published" | "failed", postUrl?, publishedAt?, note? }.
 * En-tête obligatoire : Authorization: Bearer <AGENT_API_KEY>.
 */
import { z } from "zod";
import { getDb } from "@/server/db";
import { agentAuthorized, agentEnabled, agentQueue, PLATFORMS, reportPublication } from "@/server/publishing";

export const dynamic = "force-dynamic";

function refuse(request: Request): Response | null {
  if (!agentEnabled()) return Response.json({ error: "agent_disabled" }, { status: 503 });
  if (!agentAuthorized(request.headers.get("authorization"))) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  return null;
}

export async function GET(request: Request) {
  const refused = refuse(request);
  if (refused) return refused;
  const url = new URL(request.url);
  const recipeId = url.searchParams.get("recette");
  if (recipeId && !z.uuid().safeParse(recipeId).success) {
    return Response.json({ error: "invalid_recipe" }, { status: 400 });
  }
  const recipes = await agentQueue(getDb(), url.origin, recipeId ? { recipeId } : {});
  return Response.json({ recipes }, { headers: { "Cache-Control": "no-store" } });
}

const reportSchema = z.discriminatedUnion("status", [
  z.object({
    recipeId: z.uuid(),
    platform: z.enum(PLATFORMS),
    status: z.literal("published"),
    postUrl: z.url().max(500).nullish(),
    publishedAt: z.iso.datetime({ offset: true }).nullish(),
  }),
  z.object({
    recipeId: z.uuid(),
    platform: z.enum(PLATFORMS),
    status: z.literal("failed"),
    note: z.string().max(500).nullish(),
  }),
]);

export async function POST(request: Request) {
  const refused = refuse(request);
  if (refused) return refused;
  const parsed = reportSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "invalid_body" }, { status: 400 });
  const body = parsed.data;
  const ok = await reportPublication(
    getDb(),
    body.recipeId,
    body.platform,
    body.status === "published"
      ? {
          status: "published",
          postUrl: body.postUrl ?? null,
          publishedAt: body.publishedAt ? new Date(body.publishedAt) : null,
        }
      : { status: "failed", note: body.note ?? null },
    { actorId: null, via: "agent" },
  );
  return ok ? Response.json({ ok: true }) : Response.json({ error: "recipe_not_found" }, { status: 404 });
}
