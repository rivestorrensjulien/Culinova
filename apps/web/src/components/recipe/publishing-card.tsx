"use client";

import { Badge, Button, Card, CardBody, Input, Notice, Select, Textarea } from "@culinova/ui";
import { useFormatter, useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { Link } from "@/i18n/navigation";
import {
  cancelPublicationAction,
  markPublishedAction,
  queuePublicationAction,
  setShowcaseAction,
} from "@/server/actions/publishing";
import { publishAction, refreshPublicationsAction, tiktokCreatorInfoAction } from "@/server/actions/social";
import type { RecipeView as RecipeData } from "@/server/generation/view";
import type { Platform, PublicationStatus } from "@/server/publishing";
import type { TiktokChoices } from "@/server/social/publish";
import type { CreatorInfo } from "@/server/social/tiktok";

const MUSIC_CONFIRMATION = "https://www.tiktok.com/legal/page/global/music-usage-confirmation/en";

/**
 * Choix exigés par TikTok avant chaque publication : compte, confidentialité (sans
 * valeur par défaut), interactions autorisées et accord sur l'utilisation de la musique.
 */
function TiktokPublishPanel({
  busy,
  onPublish,
  onCancel,
}: {
  busy: boolean;
  onPublish: (choices: {
    privacy: string;
    allowComments: boolean;
    allowDuet: boolean;
    allowStitch: boolean;
  }) => void;
  onCancel: () => void;
}) {
  const t = useTranslations("Publishing.tiktok");
  const [creator, setCreator] = useState<CreatorInfo | null | undefined>(undefined);
  const [privacy, setPrivacy] = useState("");
  const [allowComments, setAllowComments] = useState(false);
  const [allowDuet, setAllowDuet] = useState(false);
  const [allowStitch, setAllowStitch] = useState(false);
  const [promoteOwnBrand, setPromoteOwnBrand] = useState(false);
  useEffect(() => {
    tiktokCreatorInfoAction()
      .then(setCreator)
      .catch(() => setCreator(null));
  }, []);
  if (creator === undefined) return <p className="text-muted">{t("loading")}</p>;
  if (creator === null) return <Notice tone="danger">{t("unavailable")}</Notice>;
  const onlyPrivate =
    creator.privacyOptions.length > 0 && creator.privacyOptions.every((o) => o === "SELF_ONLY");
  const toggles = [
    { key: "comments", value: allowComments, set: setAllowComments, disabled: creator.commentDisabled },
    { key: "duet", value: allowDuet, set: setAllowDuet, disabled: creator.duetDisabled },
    { key: "stitch", value: allowStitch, set: setAllowStitch, disabled: creator.stitchDisabled },
  ] as const;
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border p-3" data-testid="tiktok-panel">
      <p>{t("account", { name: creator.nickname || creator.username })}</p>
      <label className="flex flex-col gap-1">
        <span className="font-medium">{t("privacy")}</span>
        <Select value={privacy} onChange={(e) => setPrivacy(e.target.value)} className="w-72">
          <option value="" disabled>
            {t("choose")}
          </option>
          {creator.privacyOptions.map((option) => (
            <option key={option} value={option}>
              {t.has(`privacyOptions.${option}`)
                ? t(`privacyOptions.${option}` as "privacyOptions.SELF_ONLY")
                : option}
            </option>
          ))}
        </Select>
      </label>
      {onlyPrivate ? <Notice tone="info">{t("onlyPrivate")}</Notice> : null}
      <fieldset className="flex flex-wrap gap-4">
        <legend className="mb-1 font-medium">{t("allow")}</legend>
        {toggles.map((toggle) => (
          <label key={toggle.key} className="flex items-center gap-2">
            <input
              type="checkbox"
              className="size-4 accent-primary"
              checked={toggle.value && !toggle.disabled}
              disabled={toggle.disabled}
              onChange={(e) => toggle.set(e.target.checked)}
            />
            {t(`interactions.${toggle.key}`)}
          </label>
        ))}
      </fieldset>
      <label className="flex items-start gap-2">
        <input
          type="checkbox"
          className="mt-0.5 size-4 accent-primary"
          checked={promoteOwnBrand}
          onChange={(e) => setPromoteOwnBrand(e.target.checked)}
        />
        <span>
          {t("ownBrand")}
          <span className="block text-muted">{t("ownBrandHint")}</span>
        </span>
      </label>
      <p className="text-muted">{t("aiLabel")}</p>
      <p className="text-muted">
        {t.rich("consent", {
          link: (chunks) => (
            <a
              href={MUSIC_CONFIRMATION}
              target="_blank"
              rel="noreferrer"
              className="text-primary hover:underline"
            >
              {chunks}
            </a>
          ),
        })}
      </p>
      <p className="text-muted">{t("processing")}</p>
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          disabled={busy || !privacy}
          onClick={() => onPublish({ privacy, allowComments, allowDuet, allowStitch, promoteOwnBrand })}
        >
          {t("publish")}
        </Button>
        <Button size="sm" variant="ghost" onClick={onCancel}>
          {t("cancel")}
        </Button>
      </div>
    </div>
  );
}

const PLATFORMS: Platform[] = ["tiktok", "instagram"];
type Format = PublicationStatus["format"];
/** Ce que l'administrateur peut publier : photo, carrousel et Reel sur Instagram, vidéo sur TikTok. */
const ROWS: Array<{ platform: Platform; format: Format }> = [
  { platform: "instagram", format: "photo" },
  { platform: "instagram", format: "carousel" },
  { platform: "instagram", format: "video" },
  { platform: "tiktok", format: "video" },
];

/** Statut de publication par réseau, pour les recettes de l'administrateur. */
export function PublishingCard({ recipe }: { recipe: RecipeData }) {
  const t = useTranslations("Publishing");
  const format = useFormatter();
  const [statuses, setStatuses] = useState<PublicationStatus[]>(recipe.publishing?.statuses ?? []);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const [showcase, setShowcase] = useState(recipe.publishing?.showcase ?? false);
  const [tiktokOpen, setTiktokOpen] = useState(false);
  const [publishError, setPublishError] = useState<string | null>(null);
  const [captions, setCaptions] = useState<Record<Platform, string>>(
    recipe.publishing?.captions ?? { instagram: "", tiktok: "" },
  );
  const processing = statuses.some((s) => s.status === "processing");
  useEffect(() => {
    if (!processing) return;
    const timer = setInterval(() => {
      refreshPublicationsAction(recipe.recipeId)
        .then((next) => (next ? setStatuses(next) : null))
        .catch(() => {});
    }, 8000);
    return () => clearInterval(timer);
  }, [processing, recipe.recipeId]);
  if (!recipe.publishing) return null;
  const { video, videoFailure, accounts } = recipe.publishing;
  const connected = (platform: Platform) => accounts.some((a) => a.platform === platform && !a.expired);

  const { carousel } = recipe.publishing;
  const publish = async (platform: Platform, format: Format, choices: TiktokChoices | null) => {
    setBusy(true);
    setError(false);
    setPublishError(null);
    const outcome = await publishAction(recipe.recipeId, platform, format, {
      caption: captions[platform],
      tiktok: choices,
    }).catch(() => null);
    if (!outcome) setError(true);
    else {
      setStatuses(outcome.statuses);
      if (!outcome.result.ok) {
        setPublishError(
          outcome.result.detail
            ? t("publishErrors.failedDetail", { detail: outcome.result.detail })
            : t(`publishErrors.${outcome.result.reason}`),
        );
      } else setTiktokOpen(false);
    }
    setBusy(false);
  };

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
  const statusOf = (platform: Platform, format: Format) =>
    statuses.find((s) => s.platform === platform && s.format === format);
  const hasPortrait = recipe.images.current?.formats.some((f) => f.format === "4:5") ?? false;
  const ready = (format: Format) =>
    format === "photo"
      ? hasPortrait
      : format === "carousel"
        ? Boolean(carousel?.current)
        : Boolean(video?.current);
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
        {publishError ? <Notice tone="danger">{publishError}</Notice> : null}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start" data-testid="publishing-video">
          {video ? (
            <>
              <video
                controls
                playsInline
                preload="metadata"
                src={`/api/videos/${video.id}`}
                className="aspect-[9/16] w-44 shrink-0 rounded-xl bg-black"
              />
              <div className="flex flex-col gap-2">
                <p className="font-medium">{t("video.title")}</p>
                <p className="text-muted">
                  {t("video.meta", {
                    date: format.dateTime(new Date(video.createdAt), {
                      dateStyle: "medium",
                      timeStyle: "short",
                    }),
                    seconds: Math.round(video.durationS),
                  })}
                </p>
                {video.current ? null : <Notice tone="warning">{t("video.outdated")}</Notice>}
                <p className="text-muted">{t("video.check")}</p>
                <a href={`/api/videos/${video.id}?telecharger=1`} className="text-primary hover:underline">
                  {t("video.download")}
                </a>
              </div>
            </>
          ) : (
            <div className="flex flex-col gap-2">
              <p className="font-medium">{t("video.title")}</p>
              <p className="text-muted">{queued ? t("video.pending") : t("video.none")}</p>
              {videoFailure ? (
                <Notice tone="danger">{t("video.failed", { note: videoFailure.note ?? "" })}</Notice>
              ) : null}
            </div>
          )}
        </div>
        <div className="flex flex-col gap-2" data-testid="publishing-carousel">
          <p className="font-medium">{t("carousel.title")}</p>
          {carousel ? (
            <>
              <div className="flex gap-2 overflow-x-auto pb-1">
                {Array.from({ length: carousel.slideCount }, (_, i) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    key={i}
                    src={`/api/carrousels/${carousel.id}/${i + 1}`}
                    alt={t("carousel.slide", { n: i + 1 })}
                    className="aspect-[4/5] w-28 shrink-0 rounded-lg border border-border object-cover"
                    loading="lazy"
                  />
                ))}
              </div>
              {carousel.current ? null : <Notice tone="warning">{t("carousel.outdated")}</Notice>}
            </>
          ) : (
            <p className="text-muted">{queued ? t("carousel.pending") : t("carousel.none")}</p>
          )}
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          {(["instagram", "tiktok"] as const).map((platform) => (
            <label key={platform} className="flex flex-col gap-1">
              <span className="font-medium">{t("caption", { platform: t(`platforms.${platform}`) })}</span>
              <Textarea
                value={captions[platform]}
                maxLength={2200}
                rows={7}
                onChange={(e) => setCaptions((all) => ({ ...all, [platform]: e.target.value }))}
                data-testid={`caption-${platform}`}
              />
              <span className="text-xs text-muted">
                {t("captionHint", { count: captions[platform].length })}
              </span>
            </label>
          ))}
        </div>
        <ul className="flex flex-col divide-y divide-border">
          {ROWS.map(({ platform, format: kind }) => {
            const status = statusOf(platform, kind);
            const key = `${platform}-${kind}`;
            return (
              <li key={key} className="flex flex-col gap-2 py-2" data-testid={`publishing-${key}`}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-medium">
                    {t(`formats.${platform}.${kind}` as "formats.instagram.photo")}
                  </span>
                  {!status ? (
                    <Badge>{t("none")}</Badge>
                  ) : status.status === "queued" ? (
                    <Badge tone="accent">{t("queued")}</Badge>
                  ) : status.status === "processing" ? (
                    <Badge tone="accent">{t("processing")}</Badge>
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
                {ready(kind) && status?.status !== "processing" ? (
                  connected(platform) ? (
                    platform === "tiktok" && tiktokOpen ? (
                      <TiktokPublishPanel
                        busy={busy}
                        onPublish={(choices) => publish("tiktok", "video", choices)}
                        onCancel={() => setTiktokOpen(false)}
                      />
                    ) : (
                      <div>
                        <Button
                          size="sm"
                          variant={status?.status === "published" ? "secondary" : "primary"}
                          disabled={busy}
                          data-testid={`publish-${key}`}
                          onClick={() =>
                            platform === "tiktok" ? setTiktokOpen(true) : publish(platform, kind, null)
                          }
                        >
                          {status?.status === "published"
                            ? t("publishAgain")
                            : t("publishOn", { platform: t(`platforms.${platform}`) })}
                        </Button>
                      </div>
                    )
                  ) : (
                    <p className="text-muted">
                      {t.rich("notConnected", {
                        link: (chunks) => (
                          <Link href="/admin/reseaux" className="text-primary hover:underline">
                            {chunks}
                          </Link>
                        ),
                      })}
                    </p>
                  )
                ) : null}
                {kind === "video" && status?.status !== "published" && status?.status !== "processing" ? (
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
