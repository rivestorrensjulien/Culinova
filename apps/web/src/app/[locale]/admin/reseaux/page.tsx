import { Badge, Card, CardBody, CardDescription, CardTitle, Notice } from "@culinova/ui";
import type { ReactNode } from "react";
import { setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { getDb } from "@/server/db";
import { agentEnabled } from "@/server/publishing";
import { listAccounts, socialSetup } from "@/server/social/accounts";
import { getCaptionSettings } from "@/server/social/captions";
import { redirectUri } from "@/server/social/oauth";
import { type AccountTrend, statsOverview } from "@/server/social/stats";
import { getPinterestBoard } from "@/server/social/pinterest-board";
import { getAutoplan } from "@/server/social/autoplan";
import { commentReplyStats, commentReplyStatus, getCommentReply } from "@/server/social/comment-reply";
import { COMMENT_REPLY_SCOPES } from "@/server/social/instagram";
import { upcomingSchedule } from "@/server/social/schedule";
import { RECOMMENDED_SLOTS } from "@/server/social/slots";
import {
  AnalysisView,
  AnalyzeButton,
  AutoplanToggle,
  CommentReplyForm,
  CaptionSettingsForm,
  CollectButton,
  DisconnectButton,
  PinterestBoardPicker,
} from "./actions";

const LABELS = { instagram: "Instagram", tiktok: "TikTok", pinterest: "Pinterest" } as const;
const FORMAT_LABELS = { video: "vidéo", photo: "photo", carousel: "carrousel" } as const;
/** Pinterest : la photo publiée est une épingle. */
const formatLabel = (platform: string, format: keyof typeof FORMAT_LABELS) =>
  platform === "instagram" && format === "video"
    ? "Reel"
    : platform === "pinterest"
      ? "épingle"
      : FORMAT_LABELS[format];
const ERRORS: Record<string, string> = {
  configuration:
    "Configuration incomplète : ajoutez les variables indiquées ci-dessous dans Vercel, puis redéployez.",
  refus: "Autorisation refusée sur le réseau : rien n'a été relié.",
  etat: "La connexion a expiré ou a été interrompue : recommencez.",
  echange: "Le réseau a refusé la connexion.",
};

/** « 11:30 » → « 11 h 30 », « 10:00 » → « 10 h ». */
const hm = (time: string) => (time.endsWith(":00") ? `${time.slice(0, 2)} h` : time.replace(":", " h "));
const DAYS = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"];
const number = new Intl.NumberFormat("fr-FR");
const fmt = (value: number | null | undefined) => (value == null ? "—" : number.format(value));
const dateTime = (iso: string) =>
  new Date(iso).toLocaleString("fr-FR", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Europe/Paris",
  });

/** Petite courbe des abonnés sur 30 jours. */
function Sparkline({ series }: { series: AccountTrend["series"] }) {
  const values = series.map((p) => p.followers).filter((v): v is number => v !== null);
  if (values.length < 2) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const points = values
    .map((v, i) => `${(i / (values.length - 1)) * 160},${36 - ((v - min) / (max - min || 1)) * 32}`)
    .join(" ");
  return (
    <svg
      width="160"
      height="40"
      viewBox="0 0 160 40"
      aria-label="Abonnés sur 30 jours"
      className="text-primary"
    >
      <polyline points={points} fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
    </svg>
  );
}

function SetupItem({ ok, children }: { ok: boolean; children: ReactNode }) {
  return (
    <li className="flex items-start gap-2">
      <Badge tone={ok ? "success" : "warning"}>{ok ? "OK" : "À faire"}</Badge>
      <span>{children}</span>
    </li>
  );
}

export default async function SocialPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const query = await searchParams;
  const db = getDb();
  const setup = socialSetup();
  const [accounts, overview, captions, pinterestBoard, calendar] = await Promise.all([
    listAccounts(db),
    statsOverview(db),
    getCaptionSettings(db),
    getPinterestBoard(db),
    upcomingSchedule(db),
  ]);
  const autoplan = await getAutoplan(db);
  const [commentReply, replyStats, replyStatus] = await Promise.all([
    getCommentReply(db),
    commentReplyStats(db),
    commentReplyStatus(db),
  ]);
  const instagramAccount = accounts.find((a) => a.platform === "instagram");
  // Autorisations des messages et commentaires : accordées seulement en reliant le compte à nouveau.
  const replyAllowed = COMMENT_REPLY_SCOPES.every((scope) => instagramAccount?.scopes.includes(scope));
  const agent = agentEnabled();

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="font-display text-4xl">Réseaux sociaux</h1>
        <p className="mt-2 text-muted">
          Comptes reliés, statistiques d&apos;Instagram, de TikTok et de Pinterest, et analyse de l&apos;IA.
          Les publications se valident depuis la page de chaque recette (encart « Publication sur les réseaux
          »).
        </p>
      </div>

      {query.relie === "instagram" || query.relie === "tiktok" || query.relie === "pinterest" ? (
        <Notice tone="success">Compte {LABELS[query.relie]} relié.</Notice>
      ) : null}
      {query.erreur ? (
        <Notice tone="danger">
          {ERRORS[query.erreur] ?? "La connexion a échoué."}
          {query.detail ? <span className="mt-1 block text-muted">{query.detail}</span> : null}
        </Notice>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {(["instagram", "tiktok", "pinterest"] as const).map((platform) => {
          const account = accounts.find((a) => a.platform === platform);
          const trend = overview.accounts.find((a) => a.platform === platform);
          const ready = setup.tokenKey && setup[platform];
          return (
            <Card key={platform} data-testid={`account-${platform}`}>
              <CardBody className="flex flex-col gap-3 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <CardTitle>{LABELS[platform]}</CardTitle>
                  {account ? (
                    account.expired ? (
                      <Badge tone="danger">Connexion expirée</Badge>
                    ) : (
                      <Badge tone="success">Relié</Badge>
                    )
                  ) : (
                    <Badge>Non relié</Badge>
                  )}
                </div>
                {account ? (
                  <p>
                    {account.username ? <span className="font-medium">@{account.username}</span> : null} ·
                    relié le {dateTime(account.connectedAt)}
                    {account.expiresAt ? (
                      <span className="block text-muted">
                        Connexion valable jusqu&apos;au {dateTime(account.expiresAt)} (renouvelée
                        automatiquement).
                      </span>
                    ) : null}
                  </p>
                ) : (
                  <p className="text-muted">
                    {platform === "pinterest"
                      ? "Reliez le compte Pinterest professionnel de Culinova pour épingler les recettes."
                      : "Reliez le compte @culinova.recette pour publier les vidéos et lire les statistiques."}
                  </p>
                )}
                {platform === "pinterest" && account && !account.expired ? (
                  <PinterestBoardPicker selected={pinterestBoard} />
                ) : null}
                {platform === "pinterest" && setup.hints.pinterestSandbox ? (
                  <Notice tone="info">
                    Accès d&apos;essai (bac à sable) : les épingles ne sont visibles que par votre compte tant
                    que Pinterest n&apos;a pas accordé l&apos;accès « Standard ».
                  </Notice>
                ) : null}
                {trend?.followers != null ? (
                  <div className="flex items-end justify-between gap-3">
                    <div>
                      <p className="font-display text-3xl">{fmt(trend.followers)}</p>
                      <p className="text-muted">
                        abonnés
                        {trend.followersDelta7d != null
                          ? ` · ${trend.followersDelta7d >= 0 ? "+" : ""}${fmt(trend.followersDelta7d)} en 7 jours`
                          : ""}
                      </p>
                    </div>
                    <Sparkline series={trend.series} />
                  </div>
                ) : null}
                <div className="flex flex-wrap gap-2">
                  {ready ? (
                    // Lien classique (pas de navigation côté client) : redirection vers le réseau.
                    <a
                      href={`/api/agent/${platform}/connexion`}
                      className="inline-flex h-9 items-center rounded-full bg-primary px-4 font-medium text-primary-foreground hover:opacity-90"
                      data-testid={`connect-${platform}`}
                    >
                      {account ? "Relier à nouveau" : `Relier ${LABELS[platform]}`}
                    </a>
                  ) : (
                    <Notice tone="warning">Configuration à terminer (voir plus bas).</Notice>
                  )}
                  {account ? <DisconnectButton platform={platform} label={LABELS[platform]} /> : null}
                </div>
              </CardBody>
            </Card>
          );
        })}
      </div>

      <Card data-testid="calendar" id="calendrier">
        <CardBody className="flex flex-col gap-4 text-sm">
          <div>
            <CardTitle>Calendrier des publications</CardTitle>
            <CardDescription>
              Publications proposées par l&apos;agent (à valider sur la page de la recette) et publications
              programmées. Une publication validée part toute seule à l&apos;heure prévue, dans les 10
              minutes, avec la légende validée.
            </CardDescription>
          </div>
          <AutoplanToggle enabled={autoplan.enabled} />
          {calendar.length === 0 ? (
            <p className="text-muted">
              Aucune publication prévue pour le moment
              {autoplan.enabled ? " : l'agent planifie les prochains jours dans les 10 minutes." : "."}
            </p>
          ) : (
            <ul className="flex flex-col divide-y divide-border">
              {calendar.map((entry) => (
                <li key={entry.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <span className="font-medium">{dateTime(entry.scheduledAt)}</span>
                  <span>
                    {LABELS[entry.platform]} · {formatLabel(entry.platform, entry.format)}
                  </span>
                  {entry.status === "proposed" ? (
                    <Badge tone="warning">À valider</Badge>
                  ) : (
                    <Badge tone="success">Validée</Badge>
                  )}
                  <Link href={`/app/recettes/${entry.recipeId}`} className="text-primary hover:underline">
                    {entry.recipeName}
                  </Link>
                </li>
              ))}
            </ul>
          )}
          <div className="rounded-xl bg-background p-3 text-muted">
            <p className="font-medium text-foreground">
              Créneaux conseillés (proposés au moment de programmer)
            </p>
            <ul className="mt-1 flex flex-col gap-0.5">
              {(["instagram", "tiktok", "pinterest"] as const).map((platform) => (
                <li key={platform}>
                  {LABELS[platform]} :{" "}
                  {platform === "pinterest"
                    ? `tous les jours à ${hm(RECOMMENDED_SLOTS.pinterest[0]!.time)}`
                    : RECOMMENDED_SLOTS[platform]
                        .map((slot) => `${DAYS[slot.weekday]} ${hm(slot.time)}`)
                        .join(", ")}
                </li>
              ))}
            </ul>
          </div>
        </CardBody>
      </Card>

      <Card data-testid="comment-reply">
        <CardBody className="flex flex-col gap-4 text-sm">
          <div>
            <CardTitle>« Commente {commentReply.keyword} » : le lien en message privé</CardTitle>
            <CardDescription>
              Instagram ne rend pas les liens des légendes cliquables. En message privé, ils le sont : la
              personne n&apos;a qu&apos;à toucher le lien pour ouvrir la recette.
            </CardDescription>
          </div>
          {instagramAccount && !replyAllowed ? (
            <Notice tone="warning">
              À faire une seule fois : cliquez sur « Relier à nouveau » pour Instagram (en haut de la page) et
              acceptez les autorisations « messages » et « commentaires ». Sans elles, aucun lien ne peut être
              envoyé.
            </Notice>
          ) : null}
          <CommentReplyForm enabled={commentReply.enabled} keyword={commentReply.keyword} />
          <p className="text-muted">
            30 derniers jours : {replyStats.sent} lien{replyStats.sent > 1 ? "s" : ""} envoyé
            {replyStats.sent > 1 ? "s" : ""}
            {replyStats.failed > 0 ? `, ${replyStats.failed} échec${replyStats.failed > 1 ? "s" : ""}` : ""}.
          </p>
          {replyStatus ? (
            <p className="text-muted" data-testid="comment-reply-status">
              Dernière vérification : {dateTime(replyStatus.at)} · {replyStatus.posts ?? 0} publication
              {(replyStatus.posts ?? 0) > 1 ? "s" : ""} lue{(replyStatus.posts ?? 0) > 1 ? "s" : ""},{" "}
              {replyStatus.comments ?? 0} commentaire{(replyStatus.comments ?? 0) > 1 ? "s" : ""}, dont{" "}
              {replyStatus.matched ?? 0} avec le mot-clé.
            </p>
          ) : (
            <p className="text-muted">Pas encore de vérification.</p>
          )}
          {replyStatus?.details?.length ? (
            <ul className="flex flex-col gap-1 text-xs text-muted">
              {replyStatus.details.map((d) => (
                <li key={d.mediaId}>
                  {d.name} ({d.mediaId}) :{" "}
                  {d.error ? (
                    <span className="text-danger">{d.error}</span>
                  ) : (
                    `${d.comments} commentaire${(d.comments ?? 0) > 1 ? "s" : ""}`
                  )}
                </li>
              ))}
            </ul>
          ) : null}
          {replyStatus?.error ? (
            <Notice tone="danger">Ce qui bloque : {replyStatus.error}</Notice>
          ) : replyStats.lastFailure ? (
            <Notice tone="danger">Dernier échec : {replyStats.lastFailure}</Notice>
          ) : null}
        </CardBody>
      </Card>

      <Card>
        <CardBody className="flex flex-col gap-4">
          <div>
            <CardTitle>Légendes</CardTitle>
            <CardDescription>
              Ajoutés à la légende proposée pour chaque publication (texte de la recette, puis les mentions,
              les hashtags et la mention IA). La légende reste modifiable avant chaque publication.
            </CardDescription>
          </div>
          <CaptionSettingsForm mentions={captions.mentions} aiNotice={captions.aiNotice} />
        </CardBody>
      </Card>

      <Card>
        <CardBody className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle>Statistiques des publications</CardTitle>
              <CardDescription>
                Relevées chaque matin (vues, j&apos;aime, commentaires, partages, enregistrements). Taux
                d&apos;interaction = interactions pour 100 vues.
              </CardDescription>
            </div>
            <CollectButton />
          </div>
          {overview.posts.length === 0 ? (
            <p className="text-sm text-muted">Aucune publication pour l&apos;instant.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm" data-testid="social-posts">
                <thead className="text-muted">
                  <tr className="border-b border-border">
                    <th className="py-2 pr-3 font-medium">Recette</th>
                    <th className="py-2 pr-3 font-medium">Réseau</th>
                    <th className="py-2 pr-3 font-medium">Publiée</th>
                    <th className="py-2 pr-3 text-right font-medium">Vues</th>
                    <th className="py-2 pr-3 text-right font-medium">J&apos;aime</th>
                    <th className="py-2 pr-3 text-right font-medium">Comm.</th>
                    <th className="py-2 pr-3 text-right font-medium">Partages</th>
                    <th className="py-2 pr-3 text-right font-medium">Enreg.</th>
                    <th className="py-2 text-right font-medium">Interaction</th>
                  </tr>
                </thead>
                <tbody>
                  {overview.posts.map((post) => (
                    <tr key={post.publicationId} className="border-b border-border last:border-0">
                      <td className="py-2 pr-3">
                        <Link href={`/app/recettes/${post.recipeId}`} className="hover:underline">
                          {post.name}
                        </Link>
                        {post.postUrl ? (
                          <a
                            href={post.postUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="ml-2 text-primary"
                          >
                            voir
                          </a>
                        ) : null}
                      </td>
                      <td className="py-2 pr-3 whitespace-nowrap">
                        {LABELS[post.platform]} · {formatLabel(post.platform, post.format)}
                      </td>
                      <td className="py-2 pr-3 whitespace-nowrap">
                        {post.publishedAt ? dateTime(post.publishedAt) : "—"}
                      </td>
                      <td className="py-2 pr-3 text-right tabular-nums">{fmt(post.metrics?.views)}</td>
                      <td className="py-2 pr-3 text-right tabular-nums">{fmt(post.metrics?.likes)}</td>
                      <td className="py-2 pr-3 text-right tabular-nums">{fmt(post.metrics?.comments)}</td>
                      <td className="py-2 pr-3 text-right tabular-nums">{fmt(post.metrics?.shares)}</td>
                      <td className="py-2 pr-3 text-right tabular-nums">{fmt(post.metrics?.saves)}</td>
                      <td className="py-2 text-right tabular-nums">
                        {post.engagementRate == null
                          ? "—"
                          : `${post.engagementRate.toLocaleString("fr-FR")} %`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardBody className="flex flex-col gap-4">
          <div>
            <CardTitle>Analyse et propositions</CardTitle>
            <CardDescription>
              L&apos;IA lit vos chiffres et propose des pistes concrètes pour toucher plus de monde. Gratuit,
              dans la limite du budget IA mensuel.
              {overview.lastAnalysis
                ? ` Dernière analyse : ${dateTime(overview.lastAnalysis.createdAt)}.`
                : ""}
            </CardDescription>
          </div>
          {overview.lastAnalysis ? <AnalysisView analysis={overview.lastAnalysis.analysis} /> : null}
          <AnalyzeButton />
        </CardBody>
      </Card>

      <Card>
        <CardBody className="flex flex-col gap-3 text-sm">
          <CardTitle>Configuration</CardTitle>
          <ul className="flex flex-col gap-2">
            <SetupItem ok={agent}>
              <code>AGENT_API_KEY</code> (Vercel et secret GitHub du même nom) : porte de l&apos;agent vidéo.
            </SetupItem>
            <SetupItem ok={setup.tokenKey}>
              <code>SOCIAL_TOKEN_KEY</code> : clé de chiffrement des connexions (32 octets en base64).
            </SetupItem>
            <SetupItem ok={setup.instagram}>
              <code>INSTAGRAM_APP_ID</code> et <code>INSTAGRAM_APP_SECRET</code> (Meta › Culinova Agent › API
              Instagram). Adresse de retour à déclarer : <code>{redirectUri("instagram")}</code>
            </SetupItem>
            <SetupItem ok={setup.tiktok}>
              <code>TIKTOK_CLIENT_KEY</code> et <code>TIKTOK_CLIENT_SECRET</code> (TikTok for Developers ›
              Culinova Agent). Adresse de retour à déclarer : <code>{redirectUri("tiktok")}</code>
              {setup.hints.tiktokClientKey ? (
                <span className="block text-muted">
                  Client key utilisé : <code>{setup.hints.tiktokClientKey}</code> (celui de la Sandbox
                  commence en général par « sb »).
                </span>
              ) : null}
            </SetupItem>
            <SetupItem ok={setup.pinterest}>
              <code>PINTEREST_APP_ID</code> et <code>PINTEREST_APP_SECRET</code> (developers.pinterest.com ›
              My apps › Culinova). Adresse de retour à déclarer : <code>{redirectUri("pinterest")}</code>
              <span className="block text-muted">
                Facultatif : <code>PINTEREST_API_URL</code> = <code>https://api-sandbox.pinterest.com</code>{" "}
                tant que l&apos;application est en accès d&apos;essai.
                {setup.hints.pinterestAppId ? (
                  <>
                    {" "}
                    App ID utilisé : <code>{setup.hints.pinterestAppId}</code>.
                  </>
                ) : null}
              </span>
            </SetupItem>
          </ul>
        </CardBody>
      </Card>
    </div>
  );
}
