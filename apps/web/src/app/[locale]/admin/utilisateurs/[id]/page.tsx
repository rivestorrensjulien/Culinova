import { aiGenerations, auditLogs, invitations, recipes, users } from "@culinova/db/schema";
import { Badge, Button, Card, CardBody, CardDescription, CardTitle } from "@culinova/ui";
import { and, desc, eq, sql } from "drizzle-orm";
import { notFound } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import { z } from "zod";
import { Link } from "@/i18n/navigation";
import { impersonateUserAction } from "@/server/actions/admin";
import { getDefaultQuotas, getUserQuotaOverrides } from "@/server/admin-settings";
import { getDb } from "@/server/db";
import { getMonthlyUsage } from "@/server/quotas";
import { requireAdmin } from "@/server/session";
import { formatDate, formatUsdMicros } from "../../format";
import { UserQuotasForm } from "../../reglages/forms";

export default async function AdminUserPage({ params }: { params: Promise<{ locale: string; id: string }> }) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const me = await requireAdmin(locale);
  if (!z.uuid().safeParse(id).success) notFound();
  const db = getDb();
  const [user] = await db
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
      role: users.role,
      banned: users.banned,
      createdAt: users.createdAt,
      lastLoginAt: users.lastLoginAt,
      codeHint: invitations.codeHint,
    })
    .from(users)
    .leftJoin(invitations, eq(invitations.redeemedBy, users.id))
    .where(eq(users.id, id));
  if (!user) notFound();

  const [usage, overrides, defaults, costs, recipeCount, history] = await Promise.all([
    getMonthlyUsage(db, id),
    getUserQuotaOverrides(db, id),
    getDefaultQuotas(db),
    db
      .select({
        month: sql<number>`coalesce(sum(${aiGenerations.costUsdMicros}) filter (where ${aiGenerations.createdAt} >= date_trunc('month', now())), 0)::bigint`,
        total: sql<number>`coalesce(sum(${aiGenerations.costUsdMicros}), 0)::bigint`,
      })
      .from(aiGenerations)
      .where(eq(aiGenerations.userId, id)),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(recipes)
      .where(and(eq(recipes.ownerId, id), eq(recipes.kind, "dish"))),
    db
      .select()
      .from(auditLogs)
      .where(and(eq(auditLogs.entity, "user"), eq(auditLogs.entityId, id)))
      .orderBy(desc(auditLogs.at))
      .limit(15),
  ]);
  const limit = (value: number | null) => (value === null ? "∞" : String(value));
  const canImpersonate = user.id !== me.user.id && user.role !== "admin" && !user.banned;

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-2">
        <Link href="/admin/utilisateurs" className="text-sm text-muted hover:text-foreground">
          ← Utilisateurs
        </Link>
        <h1 className="font-display text-4xl break-all">{user.email}</h1>
        <div className="flex flex-wrap items-center gap-2 text-sm text-muted">
          {user.banned ? <Badge tone="danger">Suspendu</Badge> : <Badge tone="success">Actif</Badge>}
          {user.role === "admin" ? <Badge tone="sage">Administrateur</Badge> : null}
          <span>{user.name || "—"}</span>
          <span>· code {user.codeHint ?? "—"}</span>
          <span>· inscription {formatDate(user.createdAt)}</span>
          <span>· dernière connexion {formatDate(user.lastLoginAt, true)}</span>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { title: `${usage.used.recipes} / ${limit(usage.limits.recipes)}`, label: "Recettes ce mois-ci" },
          { title: `${usage.used.images} / ${limit(usage.limits.images)}`, label: "Images ce mois-ci" },
          { title: formatUsdMicros(Number(costs[0]?.month ?? 0)), label: "Coût IA du mois" },
          {
            title: String(recipeCount[0]?.n ?? 0),
            label: "Recettes enregistrées",
            hint: `Coût IA total : ${formatUsdMicros(Number(costs[0]?.total ?? 0))}`,
          },
        ].map((card) => (
          <Card key={card.label}>
            <CardBody>
              <CardTitle className="text-3xl">{card.title}</CardTitle>
              <p className="mt-1 font-medium">{card.label}</p>
              {"hint" in card ? <CardDescription>{card.hint}</CardDescription> : null}
            </CardBody>
          </Card>
        ))}
      </div>

      {user.role === "admin" ? null : (
        <Card>
          <CardBody className="flex flex-col gap-4">
            <div>
              <CardTitle>Quotas de cette personne</CardTitle>
              <CardDescription>
                Remplissez seulement ce qui change ; les autres valeurs suivent les réglages généraux.
              </CardDescription>
            </div>
            <UserQuotasForm userId={user.id} overrides={overrides} defaults={defaults} />
          </CardBody>
        </Card>
      )}

      {canImpersonate ? (
        <Card>
          <CardBody className="flex flex-col items-start gap-3">
            <CardTitle>Se connecter en tant que</CardTitle>
            <CardDescription>
              Voir l’application exactement comme cette personne, pour l’aider (1 h au plus). L’ouverture et
              la fin sont inscrites au journal d’audit. Tout ce que vous faites compte dans ses quotas.
            </CardDescription>
            <form action={impersonateUserAction}>
              <input type="hidden" name="id" value={user.id} />
              <Button type="submit" variant="secondary">
                Se connecter en tant que {user.email}
              </Button>
            </form>
          </CardBody>
        </Card>
      ) : null}

      <section className="flex flex-col gap-3">
        <h2 className="font-display text-2xl">Historique</h2>
        <ul className="flex flex-col divide-y divide-border rounded-lg border border-border bg-surface text-sm">
          {history.map((entry) => (
            <li key={entry.id} className="flex flex-wrap justify-between gap-2 px-4 py-2">
              <span className="font-mono text-xs">{entry.action}</span>
              <span className="text-muted">{formatDate(entry.at, true)}</span>
            </li>
          ))}
          {history.length === 0 ? <li className="px-4 py-2 text-muted">Aucune action.</li> : null}
        </ul>
      </section>
    </div>
  );
}
