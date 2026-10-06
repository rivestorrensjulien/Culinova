import { invitations, users } from "@culinova/db/schema";
import { Badge, type BadgeTone, Button, Card, CardBody } from "@culinova/ui";
import { desc, eq, getTableColumns } from "drizzle-orm";
import { restoreInvitationAction, revokeInvitationAction } from "@/server/actions/admin";
import { getDb } from "@/server/db";
import { formatDate, tdClass, thClass } from "../format";
import { CreateInvitationForm } from "./create-invitation-form";

type Row = typeof invitations.$inferSelect & { userEmail: string | null };

function status(row: Row): { label: string; tone: BadgeTone } {
  if (row.revokedAt) return { label: "Révoqué", tone: "danger" };
  if (row.redeemedBy) return { label: "Utilisé", tone: "success" };
  if (row.expiresAt && row.expiresAt <= new Date()) return { label: "Expiré", tone: "neutral" };
  if (row.reservedAt && row.reservedAt > new Date(Date.now() - 30 * 60 * 1000))
    return { label: "En cours d'inscription", tone: "warning" };
  return { label: "Disponible", tone: "accent" };
}

export default async function AdminInvitationsPage() {
  const rows: Row[] = await getDb()
    .select({
      ...getTableColumns(invitations),
      userEmail: users.email,
    })
    .from(invitations)
    .leftJoin(users, eq(users.id, invitations.redeemedBy))
    .orderBy(desc(invitations.createdAt));

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="font-display text-4xl">Invitations</h1>
        <p className="mt-2 max-w-2xl text-muted">
          Un code par personne. Révoquer un code utilisé suspend aussitôt le compte associé et le déconnecte
          de tous ses appareils ; ses données sont conservées et le code peut être rétabli.
        </p>
      </div>
      <Card>
        <CardBody>
          <CreateInvitationForm />
        </CardBody>
      </Card>
      <div className="overflow-x-auto rounded-lg border border-border bg-surface">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="border-b border-border">
            <tr>
              <th className={thClass}>Code</th>
              <th className={thClass}>Libellé / e-mail</th>
              <th className={thClass}>Créé le</th>
              <th className={thClass}>Expire le</th>
              <th className={thClass}>Statut</th>
              <th className={thClass}>Utilisé par</th>
              <th className={thClass}>
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((row) => {
              const s = status(row);
              return (
                <tr key={row.id} data-testid="invitation-row">
                  <td className={`${tdClass} font-mono text-xs`}>{row.codeHint}</td>
                  <td className={tdClass}>
                    <div>{row.label ?? "—"}</div>
                    {row.email ? <div className="text-xs text-muted">{row.email}</div> : null}
                  </td>
                  <td className={tdClass}>{formatDate(row.createdAt)}</td>
                  <td className={tdClass}>{formatDate(row.expiresAt)}</td>
                  <td className={tdClass}>
                    <Badge tone={s.tone}>{s.label}</Badge>
                  </td>
                  <td className={tdClass}>{row.userEmail ?? "—"}</td>
                  <td className={`${tdClass} text-right`}>
                    {row.revokedAt ? (
                      <form action={restoreInvitationAction}>
                        <input type="hidden" name="id" value={row.id} />
                        <Button type="submit" size="sm" variant="secondary">
                          Rétablir
                        </Button>
                      </form>
                    ) : (
                      <form action={revokeInvitationAction}>
                        <input type="hidden" name="id" value={row.id} />
                        <Button type="submit" size="sm" variant="danger">
                          Révoquer
                        </Button>
                      </form>
                    )}
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 ? (
              <tr>
                <td className={`${tdClass} text-muted`} colSpan={7}>
                  Aucun code pour l’instant.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
