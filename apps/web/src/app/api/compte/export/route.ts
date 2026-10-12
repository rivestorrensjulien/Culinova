/** Export des données du compte (droit à la portabilité) : fichier JSON téléchargé. */
import { dataRequests } from "@culinova/db/schema";
import { exportAccountData } from "@/server/account";
import { audit } from "@/server/audit";
import { getDb } from "@/server/db";
import { requestMeta } from "@/server/request";
import { getCurrentSession } from "@/server/session";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getCurrentSession();
  if (!session) return new Response("Non connecté", { status: 401 });
  // Un administrateur « en tant que » ne télécharge pas les données de la personne.
  if (session.impersonatedBy) return new Response("Indisponible", { status: 403 });

  const db = getDb();
  const now = new Date();
  const data = await exportAccountData(db, session.user.id, now);
  await db.insert(dataRequests).values({
    userId: session.user.id,
    kind: "export",
    status: "done",
    completedAt: now,
  });
  await audit(db, {
    actorId: session.user.id,
    action: "account.export",
    entity: "user",
    entityId: session.user.id,
    ...(await requestMeta()),
  });
  const date = now.toISOString().slice(0, 10);
  return new Response(JSON.stringify(data, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="culinova-mes-donnees-${date}.json"`,
      "Cache-Control": "no-store",
    },
  });
}
