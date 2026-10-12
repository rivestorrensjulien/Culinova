"use client";

import { Button, Card, CardBody, cx, Notice, Spinner } from "@culinova/ui";
import { useTranslations } from "next-intl";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { generateImageAction } from "@/server/actions/images";
import { generationFailureAction, generationStatusAction } from "@/server/actions/wizard";
import type { ImageFormatName, RecipeView as RecipeData } from "@/server/generation/view";

const ASPECT: Record<ImageFormatName, string> = {
  "1:1": "aspect-square",
  "4:5": "aspect-[4/5]",
  "9:16": "aspect-[9/16]",
  "16:9": "aspect-video",
};

/**
 * Photo de la recette : image HD créée d'après le dressage, et ses 4 recadrages
 * (1:1, 4:5, 9:16, 16:9) prêts pour les réseaux sociaux. 1 crédit d'image par photo.
 */
export function PhotoCard({
  recipe,
  onChanged,
  canGenerate,
}: {
  recipe: RecipeData;
  onChanged: () => Promise<void>;
  /** Faux pour une ancienne version : la photo s'affiche, sans nouvelle génération. */
  canGenerate: boolean;
}) {
  const t = useTranslations("Photo");
  const { images } = recipe;
  const [format, setFormat] = useState<ImageFormatName>("4:5");
  const [pending, setPending] = useState<string | null>(images.pendingGenerationId);
  const [error, setError] = useState<string | null>(null);
  const checking = useRef(false);

  useEffect(() => {
    if (!pending) return;
    const id = setInterval(async () => {
      if (checking.current) return;
      checking.current = true;
      try {
        const status = await generationStatusAction(pending).catch(() => null);
        if (status === "queued" || status === "running") return;
        if (status === "failed") {
          const code = await generationFailureAction(pending).catch(() => "unexpected");
          setError(
            t.has(`errors.${code}`) ? t(`errors.${code}` as "errors.unexpected") : t("errors.unexpected"),
          );
        }
        await onChanged();
        setPending(null);
      } finally {
        checking.current = false;
      }
    }, 3000);
    return () => clearInterval(id);
  }, [pending, onChanged, t]);

  const left = images.quota.limit === null ? null : Math.max(0, images.quota.limit - images.quota.used);
  const current = images.current;
  const selected = current?.formats.find((f) => f.format === format) ?? current?.formats[0] ?? null;

  const generate = async () => {
    setError(null);
    const result = await generateImageAction(recipe.recipeId).catch(() => null);
    if (result?.ok) setPending(result.generationId);
    else if (result?.reason === "quota") setError(t("errors.quota", { limit: result.limit ?? 0 }));
    else setError(t(`errors.${result?.reason ?? "unexpected"}` as "errors.unexpected"));
  };

  return (
    <Card data-testid="photo">
      <CardBody className="flex flex-col gap-4">
        {error ? <Notice tone="danger">{error}</Notice> : null}
        {current && selected ? (
          <>
            <div
              className={cx("relative w-full overflow-hidden rounded-lg bg-raised", ASPECT[selected.format])}
            >
              <Image
                src={`/api/images/${selected.id}`}
                alt={t("alt", { name: recipe.name })}
                fill
                unoptimized
                sizes="(min-width: 1024px) 40vw, 100vw"
                className="object-cover"
                data-testid="photo-image"
              />
            </div>
            <div className="flex flex-wrap items-center gap-1" role="group" aria-label={t("formats")}>
              {current.formats.map((item) => (
                <button
                  key={item.format}
                  type="button"
                  onClick={() => setFormat(item.format)}
                  aria-pressed={item.format === selected.format}
                  className={cx(
                    "cursor-pointer rounded-full border px-2.5 py-0.5 text-xs",
                    item.format === selected.format
                      ? "border-foreground bg-foreground text-background"
                      : "border-border text-muted hover:text-foreground",
                  )}
                >
                  {t(`format.${item.format.replace(":", "x")}` as "format.1x1")}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
              <a
                href={`/api/images/${selected.id}?telecharger=1`}
                className="font-medium text-primary hover:underline"
              >
                {t("download", { width: String(selected.width), height: String(selected.height) })}
              </a>
              <a href={`/api/images/${current.id}?telecharger=1`} className="text-muted hover:underline">
                {t("downloadHd")}
              </a>
            </div>
          </>
        ) : (
          <div className="flex aspect-[4/5] w-full flex-col items-center justify-center gap-2 rounded-lg bg-soft p-6 text-center">
            <p className="font-display text-xl text-soft-foreground">{t("emptyTitle")}</p>
            <p className="text-sm text-muted">
              {recipe.versionCount > 1 ? t("changedHint") : t("emptyHint")}
            </p>
          </div>
        )}

        {pending ? (
          <p className="flex items-center gap-2 text-sm">
            <Spinner /> {t("pending")}
          </p>
        ) : canGenerate ? (
          images.available ? (
            <div className="flex flex-col gap-1">
              <Button variant={current ? "secondary" : "primary"} disabled={left === 0} onClick={generate}>
                {current ? t("regenerate") : t("generate")}
              </Button>
              {left !== null ? (
                <span className="text-xs text-muted" data-testid="images-left">
                  {t("left", { count: left })}
                </span>
              ) : null}
            </div>
          ) : (
            <p className="text-sm text-muted">{t("unavailable")}</p>
          )
        ) : null}
      </CardBody>
    </Card>
  );
}
