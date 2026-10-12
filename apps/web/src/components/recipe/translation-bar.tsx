"use client";

import { Badge, Button, cx, Notice, Spinner } from "@culinova/ui";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { translateRecipeAction, validateTranslationAction } from "@/server/actions/translation";
import type { RecipeView as RecipeData } from "@/server/generation/view";

/**
 * Versions linguistiques : bascule originale / traduction, traduction proposée par
 * l'IA à valider, et mise à jour proposée quand la recette a changé.
 */
export function TranslationBar({
  recipe,
  showing,
  onShow,
  onChanged,
}: {
  recipe: RecipeData;
  showing: boolean;
  onShow: (show: boolean) => void;
  onChanged: () => Promise<void>;
}) {
  const t = useTranslations("Translation");
  const { target, current, outdatedVersionNo } = recipe.translation;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const translate = async () => {
    setBusy(true);
    setError(null);
    const result = await translateRecipeAction(recipe.recipeId).catch(() => null);
    if (result?.ok) {
      await onChanged();
      onShow(true);
    } else setError(t(`errors.${result?.reason ?? "failed"}` as "errors.failed"));
    setBusy(false);
  };

  const segment = (active: boolean) =>
    cx(
      "cursor-pointer rounded-full px-3 py-1",
      active ? "bg-foreground text-background" : "text-muted hover:text-foreground",
    );

  return (
    <div className="flex flex-col gap-2" data-testid="translation">
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <div className="flex rounded-full border border-border p-0.5" role="group" aria-label={t("language")}>
          <button
            type="button"
            aria-pressed={!showing}
            className={segment(!showing)}
            onClick={() => onShow(false)}
          >
            {t(`names.${recipe.language}` as "names.fr")} · {t("original")}
          </button>
          {current ? (
            <button
              type="button"
              aria-pressed={showing}
              className={segment(showing)}
              onClick={() => onShow(true)}
            >
              {t(`names.${target}`)}
            </button>
          ) : null}
        </div>
        {current ? (
          current.validated ? (
            <Badge tone="sage">{t("validated")}</Badge>
          ) : (
            <>
              <Badge tone="warning">{t("toValidate")}</Badge>
              <Button
                size="sm"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  await validateTranslationAction(recipe.recipeId).catch(() => false);
                  await onChanged();
                  setBusy(false);
                }}
              >
                {t("validate")}
              </Button>
            </>
          )
        ) : outdatedVersionNo !== null ? (
          <span className="text-warning">{t("outdated", { number: outdatedVersionNo })}</span>
        ) : null}
        <Button size="sm" variant="secondary" disabled={busy} onClick={translate}>
          {current
            ? t("retranslate")
            : outdatedVersionNo !== null
              ? t("update", { language: t(`names.${target}`) })
              : t("translate", { language: t(`names.${target}`) })}
        </Button>
        {busy ? (
          <span className="flex items-center gap-2 text-muted">
            <Spinner /> {t("translating")}
          </span>
        ) : null}
      </div>
      {error ? <Notice tone="danger">{error}</Notice> : null}
    </div>
  );
}
