/**
 * Suivi appelé par l'agent toutes les 30 minutes : fait avancer les publications en
 * cours de traitement chez Instagram et TikTok. En-tête : Authorization: Bearer <AGENT_API_KEY>.
 */
import { getDb } from "@/server/db";
import { refuseAgent } from "@/server/social/agent-route";
import { advanceProcessing } from "@/server/social/publish";
import { replyToComments } from "@/server/social/comment-reply";
import { runDueSchedules } from "@/server/social/schedule";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request: Request) {
  const refused = refuseAgent(request);
  if (refused) return refused;
  const db = getDb();
  // Filet de sécurité : les publications programmées arrivées à l'heure partent aussi ici.
  const scheduled = await runDueSchedules(db);
  // « Commente RECETTE » : lien de la recette envoyé en message privé.
  const comments = await replyToComments(db).catch(() => ({ sent: 0, failed: 0 }));
  return Response.json({ comments, scheduled, publications: await advanceProcessing(db) });
}
