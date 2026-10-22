"use client";

import type { InsightsAnalysis } from "@culinova/ai";
import { Badge, Button, Notice, Select, Textarea } from "@culinova/ui";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import {
  analyzeStatsAction,
  collectStatsAction,
  createPinterestBoardAction,
  disconnectAccountAction,
  pinterestBoardsAction,
  saveCaptionSettingsAction,
  savePinterestBoardAction,
} from "@/server/actions/social";
import type { PinterestBoard } from "@/server/social/pinterest";
import type { PinterestBoardSetting } from "@/server/social/pinterest-board";

/** Même texte que AI_NOTICE (server/social/captions.ts), affiché dans le réglage. */
const AI_NOTICE_TEXT = "📸 Visuel généré par IA à partir de la recette.";

export function DisconnectButton({ platform, label }: { platform: string; label: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <Button
      variant="ghost"
      size="sm"
      disabled={pending}
      onClick={() => {
        if (
          !window.confirm(`Déconnecter ${label} ? Culinova ne pourra plus publier ni lire les statistiques.`)
        )
          return;
        start(async () => {
          await disconnectAccountAction(platform);
          router.refresh();
        });
      }}
    >
      Déconnecter
    </Button>
  );
}

export function CollectButton() {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <Button
      variant="secondary"
      size="sm"
      disabled={pending}
      onClick={() =>
        start(async () => {
          await collectStatsAction();
          router.refresh();
        })
      }
    >
      {pending ? "Relevé en cours…" : "Relever les chiffres maintenant"}
    </Button>
  );
}

const IMPACT_TONE = { fort: "success", moyen: "accent", faible: "neutral" } as const;

export function AnalysisView({ analysis }: { analysis: InsightsAnalysis }) {
  return (
    <div className="flex flex-col gap-5 text-sm" data-testid="social-analysis">
      <p className="text-base">{analysis.summary}</p>
      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <h3 className="mb-2 font-medium">Ce qui marche</h3>
          <ul className="list-disc space-y-1 pl-5">
            {analysis.strengths.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
        <div>
          <h3 className="mb-2 font-medium">Ce qui marche moins</h3>
          <ul className="list-disc space-y-1 pl-5">
            {analysis.weaknesses.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      </div>
      <div>
        <h3 className="mb-2 font-medium">Propositions pour toucher plus de monde</h3>
        <ol className="flex flex-col gap-3">
          {analysis.suggestions.map((s, i) => (
            <li key={s.title} className="rounded-xl border border-border p-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium">
                  {i + 1}. {s.title}
                </span>
                <Badge tone={IMPACT_TONE[s.impact]}>Impact {s.impact}</Badge>
              </div>
              <p className="mt-1 text-muted">{s.detail}</p>
            </li>
          ))}
        </ol>
      </div>
      {analysis.nextRecipes.length > 0 ? (
        <div>
          <h3 className="mb-2 font-medium">Recettes à publier ensuite</h3>
          <ul className="list-disc space-y-1 pl-5">
            {analysis.nextRecipes.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

export function AnalyzeButton() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="flex flex-col gap-2">
      {error ? <Notice tone="danger">{error}</Notice> : null}
      <div>
        <Button
          disabled={pending}
          data-testid="analyze-stats"
          onClick={() =>
            start(async () => {
              setError(null);
              const result = await analyzeStatsAction().catch(() => null);
              if (!result) setError("L'analyse a échoué.");
              else if (!result.ok)
                setError(
                  result.reason === "budget"
                    ? "Plafond de budget IA atteint ce mois-ci (Réglages)."
                    : "L'analyse a échoué, réessayez.",
                );
              router.refresh();
            })
          }
        >
          {pending ? "Analyse en cours…" : "Analyser avec l'IA"}
        </Button>
      </div>
    </div>
  );
}

export function CaptionSettingsForm({ mentions, aiNotice }: { mentions: string[]; aiNotice: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [text, setText] = useState(mentions.map((m) => `@${m}`).join(" "));
  const [notice, setNotice] = useState(aiNotice);
  const [saved, setSaved] = useState<boolean | null>(null);
  return (
    <form
      className="flex flex-col gap-3 text-sm"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          setSaved(await saveCaptionSettingsAction({ mentions: text, aiNotice: notice }).catch(() => false));
          router.refresh();
        });
      }}
    >
      {saved === true ? <Notice tone="success">Réglages enregistrés.</Notice> : null}
      {saved === false ? <Notice tone="danger">L&apos;enregistrement a échoué.</Notice> : null}
      <label className="flex flex-col gap-1">
        <span className="font-medium">Comptes à mentionner dans chaque publication</span>
        <Textarea
          value={text}
          rows={2}
          placeholder="@partenaire @producteur"
          onChange={(e) => setText(e.target.value)}
          data-testid="caption-mentions"
        />
        <span className="text-muted">
          Séparés par des espaces (20 au plus). Mentionnez seulement des comptes en lien avec la recette
          (producteur, partenaire, matériel) : trop de mentions fait « publicité ».
        </span>
      </label>
      <label className="flex items-start gap-2">
        <input
          type="checkbox"
          className="mt-0.5 size-4 accent-primary"
          checked={notice}
          onChange={(e) => setNotice(e.target.checked)}
        />
        <span>
          Ajouter « {AI_NOTICE_TEXT} » à la fin des légendes (recommandé : les visuels sont créés par IA).
        </span>
      </label>
      <div>
        <Button type="submit" size="sm" disabled={pending}>
          Enregistrer
        </Button>
      </div>
    </form>
  );
}

/** Tableau Pinterest où sont épinglées les recettes (liste lue sur le compte relié). */
export function PinterestBoardPicker({ selected }: { selected: PinterestBoardSetting | null }) {
  const router = useRouter();
  const [boards, setBoards] = useState<PinterestBoard[] | null | undefined>(undefined);
  const [boardId, setBoardId] = useState(selected?.boardId ?? "");
  const [saved, setSaved] = useState(false);
  const [pending, start] = useTransition();
  useEffect(() => {
    pinterestBoardsAction()
      .then((result) => setBoards(result?.boards ?? null))
      .catch(() => setBoards(null));
  }, []);
  if (boards === undefined) return <p className="text-muted">Lecture des tableaux Pinterest…</p>;
  if (boards === null)
    return <Notice tone="danger">Tableaux Pinterest illisibles : reliez le compte à nouveau.</Notice>;
  if (boards.length === 0) {
    return (
      <div className="flex flex-col gap-2">
        <Notice tone="warning">Aucun tableau sur ce compte.</Notice>
        <div>
          <Button
            size="sm"
            disabled={pending}
            onClick={() =>
              start(async () => {
                const board = await createPinterestBoardAction();
                if (board) {
                  setBoards([board]);
                  setBoardId(board.id);
                  setSaved(true);
                  router.refresh();
                }
              })
            }
          >
            Créer le tableau « Recettes Culinova »
          </Button>
        </div>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-2" data-testid="pinterest-board">
      <label className="flex flex-col gap-1">
        <span className="font-medium">Tableau des épingles</span>
        <Select
          value={boardId}
          onChange={(e) => {
            setBoardId(e.target.value);
            setSaved(false);
          }}
        >
          <option value="" disabled>
            Choisir…
          </option>
          {boards.map((board) => (
            <option key={board.id} value={board.id}>
              {board.name}
              {board.privacy === "SECRET" ? " (secret)" : ""}
            </option>
          ))}
        </Select>
      </label>
      <div className="flex items-center gap-3">
        <Button
          size="sm"
          disabled={pending || !boardId || boardId === selected?.boardId}
          onClick={() =>
            start(async () => {
              const board = boards.find((b) => b.id === boardId);
              const ok = await savePinterestBoardAction(boardId, board?.name ?? "");
              setSaved(ok);
              router.refresh();
            })
          }
        >
          Enregistrer
        </Button>
        {saved ? <Badge tone="success">Enregistré</Badge> : null}
      </div>
    </div>
  );
}
