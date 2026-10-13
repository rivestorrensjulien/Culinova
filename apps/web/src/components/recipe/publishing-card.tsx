"use client";

import { Badge, Button, Card, CardBody, Input, Notice } from "@culinova/ui";
import { useFormatter, useTranslations } from "next-intl";
import { useState } from "react";
import {
  cancelPublicationAction,
  markPublishedAction,
  queuePublicationAction,
  setShowcaseAction,
} from "@/server/actions/publishing";
import type { RecipeView as RecipeData } from "@/server/generation/view";
import type { Platform, PublicationStatus } from "@/server/publishing";

const PLATFORMS: Platform[] = ["tiktok", "instagram"];

/** Statut de publication par réseau, pour les recettes de l'administrateur. */
export function PublishingCard({ recipe }: { recipe: RecipeData }) {
  const t = useTranslations("Publishing");
  const format = useFormatter();
  const [statuses, setStatuses] = useState<PublicationStatus[]>(recipe.publishing?.statuses ?? []);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const [showcase, setShowcase] = useState(recipe.publishing?.showcase ?? false);
  if (!recipe.publishing) return null;

  const toggleShowcase = async (shown: boolean) => {
    setBusy(true);
    setError(false);
    const result = await setShowcaseAction(recipe.recipeId, shown).catch(() => null);
    if (result === null) setError(true);
    else setShowcase(result);
    setBusy(false);
  };

  const run = async (action: () => Promise<PublicationStatus[] | null>) => {
    setBusy(true);
    setError(false);
    const next = await action().catch(() => null);
    if (next) setStatuses(next);
    else setError(true);
    setBusy(false);
  };
  const statusOf = (platform: Platform) => statuses.find((s) => s.platform === platform);
  const queued = statuses.some((s) => s.status === "queued");
  const hasPhoto = recipe.images.current?.formats.some((f) => f.format === "9:16") ?? false;

  return (
    <Card data-testid="publishing">
      <CardBody className="flex flex-col gap-4 text-sm">
        <div>
          <h3 className="font-display text-xl">{t("title")}</h3>
          <p className="text-muted">{t("intro")}</p>
        </div>
        {recipe.publishing.agentEnabled ? null : <Notice tone="info">{t("agentOff")}</Notice>}
        {hasPhoto ? null : <Notice tone="warning">{t("needPhoto")}</Notice>}
        {error ? <Notice tone="danger">{t("error")}</Notice> : null}
        <ul className="flex flex-col divide-y divide-border">
          {PLATFORMS.map((platform) => {
            const status = statusOf(platform);
            return (
              <li key={platform} className="flex flex-col gap-2 py-2" data-testid={`publishing-${platform}`}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-medium">{t(`platforms.${platform}`)}</span>
                  {!status ? (
                    <Badge>{t("none")}</Badge>
                  ) : status.status === "queued" ? (
                    <Badge tone="accent">{t("queued")}</Badge>
                  ) : status.status === "published" ? (
                    <Badge tone="success">
                      {t("published", {
                        date: status.publishedAt
                          ? format.dateTime(new Date(status.publishedAt), { dateStyle: "medium" })
                          : "",
                      })}
                    </Badge>
                  ) : (
                    <Badge tone="danger">
                      {status.note ? t("failed", { note: status.note }) : t("failedNoNote")}
                    </Badge>
                  )}
                </div>
                {status?.status === "published" && status.postUrl ? (
                  <a
                    href={status.postUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-primary hover:underline"
                  >
                    {t("link")}
                  </a>
                ) : null}
                {status?.status !== "published" ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <Input
                      className="w-64"
                      type="url"
                      placeholder="https://…"
                      value={urls[platform] ?? ""}
                      onChange={(e) => setUrls((all) => ({ ...all, [platform]: e.target.value }))}
                      aria-label={`${t("postUrl")} · ${t(`platforms.${platform}`)}`}
                    />
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={busy}
                      onClick={() =>
                        run(() => markPublishedAction(recipe.recipeId, platform, urls[platform] ?? ""))
                      }
                    >
                      {t("markPublished")}
                    </Button>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
        <div className="flex flex-wrap gap-2">
          <Button
            disabled={busy}
            onClick={() => run(() => queuePublicationAction(recipe.recipeId, PLATFORMS))}
          >
            {t("queue")}
          </Button>
          {queued ? (
            <Button
              variant="secondary"
              disabled={busy}
              onClick={() => run(() => cancelPublicationAction(recipe.recipeId))}
            >
              {t("cancel")}
            </Button>
          ) : null}
        </div>
        <label className="flex items-start gap-3 border-t border-border pt-4">
          <input
            type="checkbox"
            className="mt-0.5 size-4 accent-primary"
            checked={showcase}
            disabled={busy || (!showcase && !recipe.images.current)}
            onChange={(e) => toggleShowcase(e.target.checked)}
            data-testid="showcase-toggle"
          />
          <span>
            <span className="font-medium">{t("showcase")}</span>
            <span className="block text-muted">
              {recipe.images.current ? t("showcaseHint") : t("needPhotoShowcase")}
            </span>
          </span>
        </label>
      </CardBody>
    </Card>
  );
}
