"use client";

import { cx } from "@culinova/ui";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { toggleFavoriteAction } from "@/server/actions/library";

/** Étoile « favori », utilisable sur une carte de la bibliothèque ou sur la page recette. */
export function FavoriteButton({
  recipeId,
  initial,
  className,
  onChange,
}: {
  recipeId: string;
  initial: boolean;
  className?: string;
  onChange?: (favorite: boolean) => void;
}) {
  const t = useTranslations("Library");
  const [favorite, setFavorite] = useState(initial);
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      aria-pressed={favorite}
      aria-label={favorite ? t("unfavorite") : t("favorite")}
      title={favorite ? t("unfavorite") : t("favorite")}
      disabled={busy}
      data-testid="favorite"
      onClick={async () => {
        setBusy(true);
        const next = await toggleFavoriteAction(recipeId).catch(() => null);
        if (next !== null) {
          setFavorite(next);
          onChange?.(next);
        }
        setBusy(false);
      }}
      className={cx(
        "flex size-9 cursor-pointer items-center justify-center rounded-full border border-border bg-surface/90 text-lg leading-none shadow-soft backdrop-blur transition-colors",
        favorite ? "text-primary" : "text-muted hover:text-foreground",
        className,
      )}
    >
      <span aria-hidden>{favorite ? "★" : "☆"}</span>
    </button>
  );
}
