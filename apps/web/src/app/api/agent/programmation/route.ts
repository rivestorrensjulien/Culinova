/**
 * Programmation des publications, appelée toutes les 10 minutes par GitHub Actions
 * (`.github/workflows/programmation.yml`) : lance les publications arrivées à l'heure prévue,
 * puis fait avancer celles en cours. En-tête : Authorization: Bearer <AGENT_API_KEY>.
 */
import { getDb } from "@/server/db";
import { refuseAgent } from "@/server/social/agent-route";
import { advanceProcessing } from "@/server/social/publish";
import { runDueSchedules } from "@/server/social/schedule";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST(request: Request) {
  const refused = refuseAgent(request);
  if (refused) return refused;
  const db = getDb();
  const scheduled = await runDueSchedules(db);
  return Response.json({ scheduled, publications: await advanceProcessing(db) });
}
