/**
 * Programmation des publications, appelée toutes les 10 minutes par GitHub Actions
 * (`.github/workflows/programmation.yml`) : lance les publications arrivées à l'heure prévue,
 * planifie les jours à venir (propositions à valider), puis fait avancer celles en cours. En-tête : Authorization: Bearer <AGENT_API_KEY>.
 */
import { getDb } from "@/server/db";
import { refuseAgent } from "@/server/social/agent-route";
import { advanceProcessing } from "@/server/social/publish";
import { runAutoplan } from "@/server/social/autoplan-run";
import { replyToComments } from "@/server/social/comment-reply";
import { runDueSchedules } from "@/server/social/schedule";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST(request: Request) {
  const refused = refuseAgent(request);
  if (refused) return refused;
  const db = getDb();
  const scheduled = await runDueSchedules(db);
  // Planification automatique : remplit les jours de publication à venir (propositions à valider).
  const planned = await runAutoplan(db).catch((error: unknown) => {
    console.error(`Planification automatique : ${error instanceof Error ? error.message : error}`);
    return [];
  });
  // « Commente RECETTE » : lien de la recette envoyé en message privé.
  const comments = await replyToComments(db).catch(() => ({ sent: 0, failed: 0 }));
  return Response.json({ comments, scheduled, planned, publications: await advanceProcessing(db) });
}
