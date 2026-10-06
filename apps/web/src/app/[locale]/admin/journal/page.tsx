import { auditLogs, users } from "@culinova/db/schema";
import { desc, eq } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { getDb } from "@/server/db";
import { formatDate, tdClass, thClass } from "../format";

const ACTIONS: Record<string, string> = {
  "auth.signup": "Inscription",
  "auth.login": "Connexion",
  "auth.2fa.enroll": "Second facteur activé",
  "auth.2fa.verify": "Second facteur validé",
  "auth.2fa.failed": "Second facteur : code erroné",
  "invitation.create": "Code créé",
  "invitation.send": "Invitation envoyée",
  "invitation.reserve": "Code saisi (inscription en cours)",
  "invitation.revoke": "Code révoqué",
  "invitation.restore": "Code rétabli",
  "user.suspend": "Compte suspendu",
  "user.reactivate": "Compte réactivé",
  "user.sessions.revoke": "Sessions fermées",
  "user.magic_link.resend": "Lien de connexion renvoyé",
};

export default async function AdminAuditPage() {
  const actor = alias(users, "actor");
  const rows = await getDb()
    .select({
      id: auditLogs.id,
      at: auditLogs.at,
      action: auditLogs.action,
      entity: auditLogs.entity,
      entityId: auditLogs.entityId,
      after: auditLogs.after,
      ip: auditLogs.ip,
      actorEmail: actor.email,
    })
    .from(auditLogs)
    .leftJoin(actor, eq(actor.id, auditLogs.actorId))
    .orderBy(desc(auditLogs.at))
    .limit(200);

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="font-display text-4xl">Journal d’audit</h1>
        <p className="mt-2 text-muted">
          Les 200 dernières actions sensibles. Ce journal n’est jamais modifié.
        </p>
      </div>
      <div className="overflow-x-auto rounded-lg border border-border bg-surface">
        <table className="w-full min-w-[800px] text-sm">
          <thead className="border-b border-border">
            <tr>
              <th className={thClass}>Date</th>
              <th className={thClass}>Action</th>
              <th className={thClass}>Par</th>
              <th className={thClass}>Cible</th>
              <th className={thClass}>Détails</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((row) => (
              <tr key={row.id} data-testid="audit-row">
                <td className={`${tdClass} whitespace-nowrap`}>{formatDate(row.at, true)}</td>
                <td className={tdClass}>
                  <div>{ACTIONS[row.action] ?? row.action}</div>
                  <div className="font-mono text-xs text-muted">{row.action}</div>
                </td>
                <td className={tdClass}>{row.actorEmail ?? "—"}</td>
                <td className={`${tdClass} font-mono text-xs`}>
                  {row.entity}
                  {row.entityId ? ` · ${row.entityId.slice(0, 8)}` : ""}
                </td>
                <td className={`${tdClass} max-w-xs font-mono text-xs break-all text-muted`}>
                  {row.after ? JSON.stringify(row.after) : ""}
                  {row.ip ? ` · ${row.ip}` : ""}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
