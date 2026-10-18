/**
 * Suivi appelé par l'agent toutes les 30 minutes : fait avancer les publications en
 * cours de traitement chez Instagram et TikTok. En-tête : Authorization: Bearer <AGENT_API_KEY>.
 */
import { getDb } from "@/server/db";
import { refuseAgent } from "@/server/social/agent-route";
import { advanceProcessing } from "@/server/social/publish";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request: Request) {
  const refused = refuseAgent(request);
  if (refused) return refused;
  return Response.json({ publications: await advanceProcessing(getDb()) });
}
