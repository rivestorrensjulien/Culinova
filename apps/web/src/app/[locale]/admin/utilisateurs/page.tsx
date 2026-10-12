import { monthlyPeriod } from "@culinova/core";
import { aiGenerations, invitations, sessions, usageCounters, users } from "@culinova/db/schema";
import { Badge, Button } from "@culinova/ui";
import { and, desc, eq, sql } from "drizzle-orm";
import {
  reactivateUserAction,
  resendMagicLinkAction,
  revokeUserSessionsAction,
  suspendUserAction,
} from "@/server/actions/admin";
import { Link } from "@/i18n/navigation";
import { getDb } from "@/server/db";
import { requireAdmin } from "@/server/session";
import { formatDate, formatUsdMicros, tdClass, thClass } from "../format";

export default async function AdminUsersPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const me = await requireAdmin(locale);
  const period = monthlyPeriod(new Date());
  const usage = (metric: "recipes" | "images") =>
    sql<number>`coalesce((select ${usageCounters.count} from ${usageCounters} where ${usageCounters.subjectType} = 'user' and ${usageCounters.subjectId} = ${users.id} and ${usageCounters.metric} = ${metric} and ${usageCounters.period} = ${period}), 0)::int`;

  const rows = await getDb()
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
      role: users.role,
      banned: users.banned,
      banReason: users.banReason,
      createdAt: users.createdAt,
      lastLoginAt: users.lastLoginAt,
      codeHint: invitations.codeHint,
      recipes: usage("recipes"),
      images: usage("images"),
      aiCost: sql<number>`coalesce((select sum(${aiGenerations.costUsdMicros}) from ${aiGenerations} where ${aiGenerations.userId} = ${users.id} and ${aiGenerations.createdAt} >= date_trunc('month', now())), 0)::bigint`,
      activeSessions: sql<number>`(select count(*) from ${sessions} where ${sessions.userId} = ${users.id} and ${sessions.expiresAt} > now())::int`,
    })
    .from(users)
    .leftJoin(invitations, and(eq(invitations.redeemedBy, users.id)))
    .orderBy(desc(users.createdAt));

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="font-display text-4xl">Utilisateurs</h1>
        <p className="mt-2 text-muted">Consommation et coût IA du mois en cours ({period}).</p>
      </div>
      <div className="overflow-x-auto rounded-lg border border-border bg-surface">
        <table className="w-full min-w-[960px] text-sm">
          <thead className="border-b border-border">
            <tr>
              <th className={thClass}>Personne</th>
              <th className={thClass}>Code</th>
              <th className={thClass}>Inscription</th>
              <th className={thClass}>Dernière connexion</th>
              <th className={thClass}>Recettes / images</th>
              <th className={thClass}>Coût IA</th>
              <th className={thClass}>Statut</th>
              <th className={thClass}>
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((row) => (
              <tr key={row.id} data-testid="user-row">
                <td className={tdClass}>
                  <Link href={`/admin/utilisateurs/${row.id}`} className="font-medium hover:underline">
                    {row.email}
                  </Link>
                  <div className="text-xs text-muted">
                    {row.name || "—"}
                    {row.role === "admin" ? " · administrateur" : ""}
                  </div>
                </td>
                <td className={`${tdClass} font-mono text-xs`}>{row.codeHint ?? "—"}</td>
                <td className={tdClass}>{formatDate(row.createdAt)}</td>
                <td className={tdClass}>{formatDate(row.lastLoginAt, true)}</td>
                <td className={tdClass}>
                  {row.recipes} / {row.images}
                </td>
                <td className={tdClass}>{formatUsdMicros(Number(row.aiCost))}</td>
                <td className={tdClass}>
                  {row.banned ? (
                    <Badge tone="danger">
                      {row.banReason === "invitation_revoked" ? "Suspendu (code révoqué)" : "Suspendu"}
                    </Badge>
                  ) : (
                    <Badge tone="success">Actif</Badge>
                  )}
                  <div className="mt-1 text-xs text-muted">{row.activeSessions} session(s)</div>
                </td>
                <td className={tdClass}>
                  {row.id === me.user.id ? (
                    <span className="text-xs text-muted">Vous</span>
                  ) : (
                    <div className="flex flex-wrap justify-end gap-2">
                      {row.banned ? (
                        <form action={reactivateUserAction}>
                          <input type="hidden" name="id" value={row.id} />
                          <Button type="submit" size="sm" variant="secondary">
                            Réactiver
                          </Button>
                        </form>
                      ) : (
                        <>
                          <form action={resendMagicLinkAction}>
                            <input type="hidden" name="id" value={row.id} />
                            <Button type="submit" size="sm" variant="ghost">
                              Renvoyer un lien
                            </Button>
                          </form>
                          <form action={revokeUserSessionsAction}>
                            <input type="hidden" name="id" value={row.id} />
                            <Button type="submit" size="sm" variant="secondary">
                              Fermer les sessions
                            </Button>
                          </form>
                          <form action={suspendUserAction}>
                            <input type="hidden" name="id" value={row.id} />
                            <Button type="submit" size="sm" variant="danger">
                              Suspendre
                            </Button>
                          </form>
                        </>
                      )}
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
