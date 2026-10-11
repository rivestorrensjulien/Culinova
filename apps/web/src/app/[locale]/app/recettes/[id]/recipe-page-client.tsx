"use client";

import { Button, Card, CardBody, cx, Input, Notice, Spinner } from "@culinova/ui";
import { useFormatter, useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { PricingCard } from "@/components/recipe/pricing-card";
import { RecipeView } from "@/components/recipe/recipe-view";
import { SocialContentView } from "@/components/recipe/social-content";
import {
  generationFailureAction,
  generationStatusAction,
  recipeViewAction,
  regenerateAction,
  restoreVersionAction,
} from "@/server/actions/wizard";
import type { RecipeView as RecipeData } from "@/server/generation/view";

export function RecipePageClient({ initial }: { initial: RecipeData }) {
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
        recipe={recipe}
        actions={
          <Card>
            <CardBody className="flex flex-col gap-3">
              <p className="text-sm text-muted">{t("imageSoon")}</p>
              {viewingOld ? null : pending ? (
                <p className="flex items-center gap-2 text-sm">
                  <Spinner /> {t("regenerating")}
                </p>
              ) : (
                <>
                  <Input
                    value={instruction}
                    maxLength={500}
                    onChange={(e) => setInstruction(e.target.value)}
                    placeholder={t("regenerateHint")}
                    aria-label={t("regenerateHint")}
                  />
                  <Button
                    variant="secondary"
                    disabled={left === 0}
                    onClick={async () => {
                      setError(null);
                      const result = await regenerateAction(recipe.recipeId, instruction || null);
                      if (result.ok) {
                        setPending(result.generationId);
                        setInstruction("");
                      } else {
                        setError(
                          result.reason === "quota"
                            ? t("errors.quotaRegen", { limit: result.limit ?? 0 })
                            : t(`errors.${result.reason}`),
                        );
                      }
                    }}
                  >
                    {t("regenerate")}
                  </Button>
                  {left !== null ? (
                    <span className="text-xs text-muted">{t("regenerateRemaining", { count: left })}</span>
                  ) : null}
                </>
              )}
            </CardBody>
          </Card>
        }
      />
      {viewingOld ? null : <PricingCard key={recipe.versionId} recipe={recipe} />}
      <section className="flex flex-col gap-4">
        <h2 className="font-display text-3xl">{t("questions.social")}</h2>
        <SocialContentView social={recipe.social} />
      </section>
    </div>
  );
}
