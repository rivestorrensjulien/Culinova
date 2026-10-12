"use client";

import { Button, Card, CardBody, cx, Notice, Spinner, Textarea } from "@culinova/ui";
import { useFormatter, useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState } from "react";
import { FavoriteButton } from "@/components/favorite-button";
import { NutritionCard } from "@/components/recipe/nutrition-card";
import { PhotoCard } from "@/components/recipe/photo-card";
import { PricingCard } from "@/components/recipe/pricing-card";
import { RecipeView } from "@/components/recipe/recipe-view";
import { baseGenerationStatusAction, makeHomemadeAction } from "@/server/actions/bases";
import { SocialContentView } from "@/components/recipe/social-content";
import {
  generationFailureAction,
  generationStatusAction,
  recipeViewAction,
  editRecipeAction,
  regenerateAction,
  restoreVersionAction,
} from "@/server/actions/wizard";
import type { StartResult } from "@/server/generation/start";
import type { RecipeView as RecipeData } from "@/server/generation/view";

export function RecipePageClient({ initial, targetG }: { initial: RecipeData; targetG?: number }) {
  const t = useTranslations("Wizard");
  const tr = useTranslations("Recipe");
  const format = useFormatter();
  const [recipe, setRecipe] = useState(initial);
  const [notice, setNotice] = useState<string | null>(null);
  const [switching, setSwitching] = useState(false);
  const viewingOld = recipe.versionNo !== recipe.currentVersionNo;

  const showVersion = async (versionNo: number) => {
    setSwitching(true);
    setNotice(null);
    const view = await recipeViewAction(recipe.recipeId, versionNo).catch(() => null);
    if (view) setRecipe(view);
    setSwitching(false);
  };
  const [pending, setPending] = useState<string | null>(initial.pendingGenerationId);
  // Recettes maison en cours de rédaction : ligne d'ingrédient → génération.
  const [pendingBases, setPendingBases] = useState<Map<string, string>>(
    () =>
      new Map(
        initial.ingredients.flatMap((i) =>
          i.pendingBaseGenerationId ? [[i.id, i.pendingBaseGenerationId] as const] : [],
        ),
      ),
  );
  const isBase = recipe.kind === "base";
  // Recharge la recette affichée (après une photo, une correspondance nutritionnelle…).
  const recipeId = recipe.recipeId;
  const versionNo = recipe.versionNo;
  const reload = useCallback(async () => {
    const view = await recipeViewAction(recipeId, versionNo).catch(() => null);
    if (view) setRecipe(view);
  }, [recipeId, versionNo]);
  const [instruction, setInstruction] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!pending) return;
    const id = setInterval(async () => {
      const status = await generationStatusAction(pending).catch(() => null);
      if (!status || status === "queued" || status === "running") return;
      if (status === "failed") {
        const code = await generationFailureAction(pending).catch(() => "unexpected");
        setError(
          t.has(`errors.${code}`) ? t(`errors.${code}` as "errors.unexpected") : t("errors.unexpected"),
        );
      }
      const view = await recipeViewAction(recipe.recipeId);
      if (view) setRecipe(view);
      setPending(null);
    }, 2000);
    return () => clearInterval(id);
  }, [pending, recipe.recipeId, t]);

  // Une seule vérification à la fois : les appels ne se chevauchent pas.
  const checking = useRef(false);
  useEffect(() => {
    if (pendingBases.size === 0) return;
    const id = setInterval(async () => {
      if (checking.current) return;
      checking.current = true;
      try {
        const done: string[] = [];
        let failedId: string | null = null;
        for (const [lineId, generationId] of pendingBases) {
          const status = await baseGenerationStatusAction(generationId).catch(() => null);
          if (status === "succeeded" || status === "failed" || status === null) done.push(lineId);
          if (status === "failed") failedId = generationId;
        }
        if (done.length === 0) return;
        if (failedId) {
          // Cause précise (réponse invalide, coupée, service indisponible…), comme pour la régénération.
          const code = await generationFailureAction(failedId).catch(() => "unexpected");
          const reason = t.has(`errors.${code}`)
            ? t(`errors.${code}` as "errors.unexpected")
            : t("errors.unexpected");
          setError(`${tr("homemadeFailed")} ${reason}`);
        }
        const view = await recipeViewAction(recipe.recipeId).catch(() => null);
        if (view) setRecipe(view);
        setPendingBases((all) => {
          const next = new Map(all);
          for (const lineId of done) next.delete(lineId);
          return next;
        });
      } finally {
        checking.current = false;
      }
    }, 2500);
    return () => clearInterval(id);
  }, [pendingBases, recipe.recipeId, t, tr]);

  const makeHomemade = async (lineId: string) => {
    setError(null);
    const result = await makeHomemadeAction(lineId).catch(() => null);
    if (result?.ok) {
      setPendingBases((all) => new Map(all).set(lineId, result.generationId));
    } else if (result?.reason === "already_homemade") {
      const view = await recipeViewAction(recipe.recipeId);
      if (view) setRecipe(view);
    } else {
      setError(
        result?.reason === "budget"
          ? t("errors.budget")
          : result?.reason === "busy"
            ? tr("homemadeBusy")
            : t("errors.unexpected"),
      );
    }
  };

  /** Modification par instruction ou nouvelle proposition : même quota, suivi identique. */
  const startChange = async (start: () => Promise<StartResult>) => {
    setError(null);
    const result = await start().catch(() => null);
    if (result?.ok) {
      setPending(result.generationId);
      setInstruction("");
    } else if (result?.reason === "quota") {
      setError(t("errors.quotaRegen", { limit: result.limit ?? 0 }));
    } else {
      setError(t(`errors.${result?.reason ?? "unexpected"}` as "errors.unexpected"));
    }
  };

  const limit = recipe.regenerations.limit;
  const left = limit === null ? null : Math.max(0, limit - recipe.regenerations.used);

  return (
    <div className="flex flex-col gap-10">
      {error ? <Notice tone="danger">{error}</Notice> : null}
      {recipe.versions.length > 1 ? (
        <section className="flex flex-col gap-3" aria-label={tr("versionsTitle")} data-testid="versions">
          <h2 className="text-sm font-medium text-muted">{tr("versionsTitle")}</h2>
          <div className="flex flex-wrap gap-2">
            {recipe.versions.map((v) => (
              <button
                key={v.versionNo}
                type="button"
                disabled={switching}
                onClick={() => showVersion(v.versionNo)}
                aria-pressed={v.versionNo === recipe.versionNo}
                title={v.changeNote ?? v.name}
                className={cx(
                  "flex cursor-pointer flex-col items-start rounded-lg border px-3 py-2 text-left text-sm",
                  v.versionNo === recipe.versionNo
                    ? "border-foreground bg-raised"
                    : "border-border text-muted hover:text-foreground",
                )}
              >
                <span className="font-medium">
                  {tr("versionItem", { number: v.versionNo })}
                  {v.versionNo === recipe.currentVersionNo ? ` · ${tr("versionActive")}` : ""}
                </span>
                <span className="max-w-56 truncate text-xs">{v.name}</span>
                <span className="text-xs text-muted">
                  {format.dateTime(new Date(v.createdAt), { dateStyle: "short", timeStyle: "short" })}
                </span>
              </button>
            ))}
          </div>
          {notice ? <Notice tone="success">{notice}</Notice> : null}
          {viewingOld ? (
            <Notice tone="info">
              <span className="flex flex-wrap items-center gap-3">
                {tr("versionViewing", { number: recipe.versionNo, active: recipe.currentVersionNo })}
                <Button
                  size="sm"
                  disabled={switching}
                  onClick={async () => {
                    setSwitching(true);
                    const number = recipe.versionNo;
                    const view = await restoreVersionAction(recipe.recipeId, number).catch(() => null);
                    if (view) {
                      setRecipe(view);
                      setNotice(tr("versionRestored", { number }));
                    }
                    setSwitching(false);
                  }}
                >
                  {tr("versionRestore")}
                </Button>
                <Button size="sm" variant="secondary" onClick={() => showVersion(recipe.currentVersionNo)}>
                  {tr("versionBackToActive")}
                </Button>
              </span>
            </Notice>
          ) : null}
        </section>
      ) : null}
      <RecipeView
        key={`view-${recipe.versionId}`}
        recipe={recipe}
        initialTargetG={targetG}
        pendingLineIds={new Set(pendingBases.keys())}
        {...(viewingOld || isBase ? {} : { onMakeHomemade: makeHomemade })}
        photo={<PhotoCard recipe={recipe} onChanged={reload} canGenerate={!viewingOld} />}
        titleAction={
          <FavoriteButton key={recipe.recipeId} recipeId={recipe.recipeId} initial={recipe.favorite} />
        }
        actions={
          isBase || viewingOld ? undefined : (
            <Card>
              <CardBody className="flex flex-col gap-3">
                {viewingOld ? null : pending ? (
                  <p className="flex items-center gap-2 text-sm">
                    <Spinner /> {t("regenerating")}
                  </p>
                ) : (
                  <>
                    <h3 className="font-display text-xl">{tr("editTitle")}</h3>
                    <Textarea
                      value={instruction}
                      maxLength={500}
                      rows={2}
                      onChange={(e) => setInstruction(e.target.value)}
                      placeholder={tr("editHint")}
                      aria-label={tr("editTitle")}
                    />
                    <Button
                      disabled={left === 0 || !instruction.trim()}
                      onClick={() => startChange(() => editRecipeAction(recipe.recipeId, instruction))}
                    >
                      {tr("editApply")}
                    </Button>
                    <Button
                      variant="secondary"
                      disabled={left === 0}
                      onClick={() => startChange(() => regenerateAction(recipe.recipeId, null))}
                    >
                      {tr("editOther")}
                    </Button>
                    {left !== null ? (
                      <span className="text-xs text-muted">{t("regenerateRemaining", { count: left })}</span>
                    ) : null}
                  </>
                )}
              </CardBody>
            </Card>
          )
        }
      />
      {viewingOld || isBase ? null : <PricingCard key={`pricing-${recipe.versionId}`} recipe={recipe} />}
      {viewingOld ? null : <NutritionCard recipe={recipe} onChanged={reload} />}
      {isBase ? null : (
        <section className="flex flex-col gap-4">
          <h2 className="font-display text-3xl">{t("questions.social")}</h2>
          <SocialContentView social={recipe.social} />
        </section>
      )}
    </div>
  );
}
