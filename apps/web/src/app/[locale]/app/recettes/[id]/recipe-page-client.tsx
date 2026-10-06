"use client";

import { Button, Card, CardBody, Input, Notice, Spinner } from "@culinova/ui";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { RecipeView } from "@/components/recipe/recipe-view";
import { SocialContentView } from "@/components/recipe/social-content";
import { generationStatusAction, recipeViewAction, regenerateAction } from "@/server/actions/wizard";
import type { RecipeView as RecipeData } from "@/server/generation/view";

export function RecipePageClient({ initial }: { initial: RecipeData }) {
  const t = useTranslations("Wizard");
  const [recipe, setRecipe] = useState(initial);
  const [pending, setPending] = useState<string | null>(initial.pendingGenerationId);
  const [instruction, setInstruction] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!pending) return;
    const id = setInterval(async () => {
      const status = await generationStatusAction(pending).catch(() => null);
      if (!status || status === "queued" || status === "running") return;
      if (status === "failed") setError(t("errors.unexpected"));
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
      <RecipeView
        recipe={recipe}
        actions={
          <Card>
            <CardBody className="flex flex-col gap-3">
              <p className="text-sm text-muted">{t("imageSoon")}</p>
              {pending ? (
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
      <section className="flex flex-col gap-4">
        <h2 className="font-display text-3xl">{t("questions.social")}</h2>
        <SocialContentView social={recipe.social} />
      </section>
    </div>
  );
}
