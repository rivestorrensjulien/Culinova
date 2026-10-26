import { Badge, type BadgeTone, Button, Input } from "@culinova/ui";
import { listInvitationRequests, requestSourceStats, type RequestStatus } from "@/server/access/requests";
import { acceptRequestAction, declineRequestAction } from "@/server/actions/admin";
import { getDb } from "@/server/db";
import { Link } from "@/i18n/navigation";
import { formatDate, tdClass, thClass } from "../format";

const STATUS: Record<RequestStatus, { label: string; tone: BadgeTone }> = {
  pending: { label: "En attente", tone: "warning" },
  invited: { label: "Invité", tone: "success" },
  declined: { label: "Refusé", tone: "neutral" },
};

const FILTERS: Array<{ value: RequestStatus | "all"; label: string }> = [
  { value: "pending", label: "En attente" },
  { value: "invited", label: "Invités" },
  { value: "declined", label: "Refusés" },
  { value: "all", label: "Toutes" },
];

/** Demandes d'invitation déposées sur la page d'accueil. */
export default async function AdminRequestsPage({
  searchParams,
}: {
  searchParams: Promise<{ statut?: string }>;
}) {
  const { statut } = await searchParams;
  const filter = FILTERS.find((f) => f.value === statut)?.value ?? "pending";
  const [rows, stats] = await Promise.all([
    listInvitationRequests(getDb(), filter === "all" ? undefined : filter),
    requestSourceStats(getDb()),
  ]);
  const total = stats.bySource.reduce((sum, s) => sum + s.requests, 0);

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="font-display text-4xl">Demandes d’invitation</h1>
        <p className="mt-2 max-w-2xl text-muted">
          Demandes déposées sur la page d’accueil. « Inviter » crée un code réservé à l’adresse de la personne
          et le lui envoie par e-mail, dans sa langue. « Refuser » n’envoie aucun message. Les demandes sont
          effacées automatiquement après 12 mois.
        </p>
      </div>
      {total > 0 ? (
        <section
          className="flex flex-col gap-4 rounded-lg border border-border bg-surface p-5"
          data-testid="request-sources"
        >
          <div>
            <h2 className="font-display text-2xl">D’où viennent les demandes</h2>
            <p className="mt-1 text-sm text-muted">
              Réseau d’où vient chaque personne : lien d’une publication, message « RECETTE », lien en bio, ou
              site précédent. Sans aucun indice : « Accès direct ».
            </p>
          </div>
          <ul className="flex flex-col gap-2">
            {stats.bySource.map((s) => (
              <li key={s.source ?? "inconnue"} className="flex items-center gap-3 text-sm">
                <span className="w-44 shrink-0 font-medium">{s.label}</span>
                <span className="h-2 flex-1 overflow-hidden rounded-full bg-soft" aria-hidden="true">
                  <span
                    className="block h-full rounded-full bg-primary"
                    style={{ width: `${Math.max(4, Math.round((s.requests / total) * 100))}%` }}
                  />
                </span>
                <span className="w-40 shrink-0 text-right tabular-nums">
                  {s.requests} demande{s.requests > 1 ? "s" : ""} · {s.invited} invitée
                  {s.invited > 1 ? "s" : ""}
                </span>
              </li>
            ))}
          </ul>
          {stats.byRecipe.length > 0 ? (
            <p className="text-sm text-muted">
              Recettes qui donnent le plus envie :{" "}
              {stats.byRecipe.map((r, i) => (
                <span key={r.recipe}>
                  {i > 0 ? ", " : ""}
                  <a
                    href={`/recette/${r.recipe}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-foreground underline-offset-2 hover:underline"
                  >
                    {r.recipe}
                  </a>{" "}
                  ({r.requests})
                </span>
              ))}
            </p>
          ) : null}
        </section>
      ) : null}
      <nav className="flex flex-wrap gap-2" aria-label="Filtrer les demandes">
        {FILTERS.map((f) => (
          <Link
            key={f.value}
            href={{ pathname: "/admin/demandes", query: { statut: f.value } }}
            aria-current={f.value === filter ? "page" : undefined}
            className={
              f.value === filter
                ? "rounded-full border border-foreground bg-foreground px-3 py-1 text-sm text-background"
                : "rounded-full border border-border px-3 py-1 text-sm text-muted hover:text-foreground"
            }
          >
            {f.label}
          </Link>
        ))}
      </nav>
      <div className="overflow-x-auto rounded-lg border border-border bg-surface">
        <table className="w-full min-w-[900px] text-sm">
          <thead className="border-b border-border">
            <tr>
              <th className={thClass}>Personne</th>
              <th className={thClass}>Profil et message</th>
              <th className={thClass}>Provenance</th>
              <th className={thClass}>Reçue le</th>
              <th className={thClass}>Statut</th>
              <th className={thClass}>
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((row) => (
              <tr key={row.id} data-testid="request-row">
                <td className={tdClass}>
                  <div className="font-medium">{row.name}</div>
                  <div className="text-xs text-muted">{row.email}</div>
                  <div className="text-xs text-muted uppercase">{row.locale}</div>
                </td>
                <td className={`${tdClass} max-w-sm`}>
                  <div>{row.profile ?? "—"}</div>
                  {row.message ? (
                    <p className="mt-1 text-xs whitespace-pre-line text-muted">{row.message}</p>
                  ) : null}
                </td>
                <td className={tdClass} data-testid="request-origin">
                  <div>{row.origin.label}</div>
                  {row.origin.detail ? <div className="text-xs text-muted">{row.origin.detail}</div> : null}
                  {row.origin.recipe ? (
                    <a
                      href={`/recette/${row.origin.recipe}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-muted underline-offset-2 hover:text-foreground hover:underline"
                    >
                      {row.origin.recipe}
                    </a>
                  ) : null}
                  {row.origin.referrer && row.origin.source === "site" ? (
                    <div className="text-xs text-muted">{row.origin.referrer}</div>
                  ) : null}
                </td>
                <td className={tdClass}>{formatDate(row.createdAt, true)}</td>
                <td className={tdClass}>
                  <Badge tone={STATUS[row.status].tone}>{STATUS[row.status].label}</Badge>
                  {row.decidedAt ? (
                    <div className="mt-1 text-xs text-muted">{formatDate(row.decidedAt)}</div>
                  ) : null}
                </td>
                <td className={`${tdClass} text-right`}>
                  {row.status === "pending" ? (
                    <div className="flex flex-col items-end gap-2">
                      <form action={acceptRequestAction} className="flex items-center gap-2">
                        <input type="hidden" name="id" value={row.id} />
                        <label className="sr-only" htmlFor={`days-${row.id}`}>
                          Validité en jours
                        </label>
                        <Input
                          id={`days-${row.id}`}
                          name="expiresInDays"
                          type="number"
                          min={1}
                          max={365}
                          defaultValue={30}
                          className="w-20"
                          title="Validité du code en jours (vide = sans limite)"
                        />
                        <Button type="submit" size="sm">
                          Inviter
                        </Button>
                      </form>
                      <form action={declineRequestAction}>
                        <input type="hidden" name="id" value={row.id} />
                        <Button type="submit" size="sm" variant="ghost">
                          Refuser
                        </Button>
                      </form>
                    </div>
                  ) : null}
                </td>
              </tr>
            ))}
            {rows.length === 0 ? (
              <tr>
                <td className={`${tdClass} text-muted`} colSpan={6}>
                  Aucune demande ici pour l’instant.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
