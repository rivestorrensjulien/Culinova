import { auditLogs, invitations, users } from "@culinova/db/schema";
import { Card, CardBody, CardDescription, CardTitle } from "@culinova/ui";
import { desc, sql } from "drizzle-orm";
import { getDb } from "@/server/db";
import { getAiBudgetCap, getAiSpend } from "@/server/quotas";
import { formatDate, formatUsdMicros } from "./format";

export default async function AdminDashboardPage() {
  const db = getDb();
  const [userStats] = await db
    .select({
      total: sql<number>`count(*)::int`,
      suspended: sql<number>`count(*) filter (where ${users.banned})::int`,
      activeThisMonth: sql<number>`count(*) filter (where ${users.lastLoginAt} > date_trunc('month', now()))::int`,
    })
    .from(users);
  const [invitationStats] = await db
    .select({
      available: sql<number>`count(*) filter (where ${invitations.redeemedBy} is null and ${invitations.revokedAt} is null and (${invitations.expiresAt} is null or ${invitations.expiresAt} > now()))::int`,
      used: sql<number>`count(*) filter (where ${invitations.redeemedBy} is not null)::int`,
      revoked: sql<number>`count(*) filter (where ${invitations.revokedAt} is not null)::int`,
    })
    .from(invitations);
  const [spent, cap] = await Promise.all([getAiSpend(db), getAiBudgetCap(db)]);
  const recent = await db.select().from(auditLogs).orderBy(desc(auditLogs.at)).limit(8);

  const cards = [
    { title: `${userStats?.total ?? 0}`, label: "Comptes", hint: `${userStats?.suspended ?? 0} suspendu(s)` },
    {
      title: `${userStats?.activeThisMonth ?? 0}`,
      label: "Actifs ce mois-ci",
      hint: "Au moins une connexion",
    },
    {
      title: `${invitationStats?.available ?? 0}`,
      label: "Codes disponibles",
      hint: `${invitationStats?.used ?? 0} utilisé(s) · ${invitationStats?.revoked ?? 0} révoqué(s)`,
    },
    {
      title: formatUsdMicros(spent),
      label: "Coût IA du mois",
      hint: cap === null ? "Plafond non défini" : `Plafond : ${formatUsdMicros(cap)}`,
    },
  ];

  return (
    <div className="flex flex-col gap-8">
      <h1 className="font-display text-4xl">Tableau de bord</h1>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((card) => (
          <Card key={card.label}>
            <CardBody>
              <CardTitle className="text-3xl">{card.title}</CardTitle>
              <p className="mt-1 font-medium">{card.label}</p>
              <CardDescription>{card.hint}</CardDescription>
            </CardBody>
          </Card>
        ))}
      </div>
      <section className="flex flex-col gap-3">
        <h2 className="font-display text-2xl">Dernières actions</h2>
        <ul className="flex flex-col divide-y divide-border rounded-lg border border-border bg-surface text-sm">
          {recent.map((entry) => (
            <li key={entry.id} className="flex flex-wrap justify-between gap-2 px-4 py-2">
              <span className="font-mono text-xs">{entry.action}</span>
              <span className="text-muted">{formatDate(entry.at, true)}</span>
            </li>
          ))}
          {recent.length === 0 ? (
            <li className="px-4 py-2 text-muted">Aucune action pour l’instant.</li>
          ) : null}
        </ul>
      </section>
    </div>
  );
}
