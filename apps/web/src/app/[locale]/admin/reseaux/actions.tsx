"use client";

import type { InsightsAnalysis } from "@culinova/ai";
import { Badge, Button, Notice } from "@culinova/ui";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { analyzeStatsAction, collectStatsAction, disconnectAccountAction } from "@/server/actions/social";

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
