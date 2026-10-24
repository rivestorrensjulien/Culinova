"use client";

import { Badge, Button, Card, CardBody, Input, Notice, Select, Textarea } from "@culinova/ui";
import { useFormatter, useTranslations } from "next-intl";
import { type ReactNode, useEffect, useState } from "react";
import { Link } from "@/i18n/navigation";
import {
  cancelPublicationAction,
  markPublishedAction,
  queuePublicationAction,
  setPublicPageAction,
  setShowcaseAction,
} from "@/server/actions/publishing";
import {
  approveProposalAction,
  cancelScheduleAction,
  dismissProposalAction,
  rejectRecipeAction,
  requestVideoAction,
  publishAction,
  refreshPublicationsAction,
  schedulePublicationAction,
  suggestSlotAction,
  tiktokCreatorInfoAction,
} from "@/server/actions/social";
import type { RecipeView as RecipeData } from "@/server/generation/view";
import type { Platform, PublicationStatus } from "@/server/publishing";
import type { TiktokChoices } from "@/server/social/publish";
import type { ScheduledView } from "@/server/social/schedule";
import { fromParisInput, toParisInput } from "@/server/social/slots";
import type { CreatorInfo } from "@/server/social/tiktok";

const MUSIC_CONFIRMATION = "https://www.tiktok.com/legal/page/global/music-usage-confirmation/en";
const BRANDED_CONTENT_POLICY = "https://www.tiktok.com/legal/page/global/bc-policy/en";

/** Champ « date et heure » de la programmation, prérempli avec le prochain créneau conseillé. */
function ScheduleField({
  when,
  suggested,
  onChange,
}: {
  when: string;
  suggested: string | null | undefined;
  onChange: (value: string) => void;
}) {
  const t = useTranslations("Publishing.schedule");
  const format = useFormatter();
  const suggestedDate = suggested ? fromParisInput(suggested) : null;
  return (
    <div className="flex flex-col gap-1">
      <label className="flex flex-col gap-1">
        <span className="font-medium">{t("when")}</span>
        <Input
          type="datetime-local"
          className="w-64"
          value={when}
          min={toParisInput(new Date())}
          onChange={(e) => onChange(e.target.value)}
          data-testid="schedule-when"
        />
      </label>
      <span className="text-xs text-muted">
        {suggested === undefined
          ? "…"
          : suggestedDate
            ? t("suggested", {
                date: format.dateTime(suggestedDate, {
                  weekday: "long",
                  day: "numeric",
                  month: "long",
                  hour: "2-digit",
                  minute: "2-digit",
                  timeZone: "Europe/Paris",
                }),
              })
            : t("noSuggestion")}
      </span>
      <span className="text-xs text-muted">{t("hint")}</span>
    </div>
  );
}

/**
 * Choix exigés par TikTok avant chaque publication (règles de partage de contenu) : compte,
 * confidentialité sans valeur par défaut, interactions autorisées, déclaration de contenu
 * commercial (votre marque / contenu de marque) et accord sur la musique.
 */
function TiktokPublishPanel({
  busy,
  onPublish,
  onCancel,
  scheduleField,
}: {
  busy: boolean;
  onPublish: (choices: TiktokChoices) => void;
  onCancel: () => void;
  /** Mode « Programmer » : champ de date affiché avant le bouton. */
  scheduleField?: ReactNode;
}) {
  const tSchedule = useTranslations("Publishing.schedule");
  const t = useTranslations("Publishing.tiktok");
  const [creator, setCreator] = useState<CreatorInfo | null | undefined>(undefined);
  const [privacy, setPrivacy] = useState("");
  const [allowComments, setAllowComments] = useState(false);
  const [allowDuet, setAllowDuet] = useState(false);
  const [allowStitch, setAllowStitch] = useState(false);
  const [disclose, setDisclose] = useState(false);
  const [promoteOwnBrand, setPromoteOwnBrand] = useState(false);
  const [brandedContent, setBrandedContent] = useState(false);
  useEffect(() => {
    tiktokCreatorInfoAction()
      .then(setCreator)
      .catch(() => setCreator(null));
  }, []);
  if (creator === undefined) return <p className="text-muted">{t("loading")}</p>;
  if (creator === null) return <Notice tone="danger">{t("unavailable")}</Notice>;
  const onlyPrivate =
    creator.privacyOptions.length > 0 && creator.privacyOptions.every((o) => o === "SELF_ONLY");
  const ownBrand = disclose && promoteOwnBrand;
  const branded = disclose && brandedContent;
  const missingDisclosure = disclose && !promoteOwnBrand && !brandedContent;
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
            <option key={option} value={option} disabled={branded && option === "SELF_ONLY"}>
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
      <div className="flex flex-col gap-2 rounded-lg bg-background p-3">
        <label className="flex items-start gap-2">
          <input
            type="checkbox"
            className="mt-0.5 size-4 accent-primary"
            checked={disclose}
            onChange={(e) => setDisclose(e.target.checked)}
            data-testid="tiktok-disclose"
          />
          <span>
            <span className="font-medium">{t("disclose")}</span>
            <span className="block text-muted">{t("discloseHint")}</span>
          </span>
        </label>
        {disclose ? (
          <div className="flex flex-col gap-2 pl-6">
            <label className="flex items-start gap-2">
              <input
                type="checkbox"
                className="mt-0.5 size-4 accent-primary"
                checked={promoteOwnBrand}
                onChange={(e) => setPromoteOwnBrand(e.target.checked)}
              />
              <span>
                {t("yourBrand")}
                <span className="block text-muted">{t("yourBrandHint")}</span>
              </span>
            </label>
            <label className="flex items-start gap-2">
              <input
                type="checkbox"
                className="mt-0.5 size-4 accent-primary"
                checked={brandedContent}
                disabled={privacy === "SELF_ONLY"}
                onChange={(e) => setBrandedContent(e.target.checked)}
              />
              <span>
                {t("brandedContent")}
                <span className="block text-muted">
                  {privacy === "SELF_ONLY" ? t("brandedPrivate") : t("brandedContentHint")}
                </span>
              </span>
            </label>
            {missingDisclosure ? <Notice tone="warning">{t("needOne")}</Notice> : null}
            {branded ? (
              <p className="text-muted">{t("labelPaid")}</p>
            ) : ownBrand ? (
              <p className="text-muted">{t("labelPromotional")}</p>
            ) : null}
          </div>
        ) : null}
      </div>
      <p className="text-muted">{t("aiLabel")}</p>
      <p className="text-muted">
        {t.rich(branded ? "consentBranded" : "consent", {
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
          brand: (chunks) => (
            <a
              href={BRANDED_CONTENT_POLICY}
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
      {scheduleField}
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          disabled={busy || !privacy || missingDisclosure}
          onClick={() =>
            onPublish({
              privacy,
              allowComments,
              allowDuet,
              allowStitch,
              promoteOwnBrand: ownBrand,
              brandedContent: branded,
            })
          }
        >
          {scheduleField ? tSchedule("tiktokConfirm") : t("publish")}
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
/**
 * Ce que l'administrateur peut publier : photo, carrousel et Reel sur Instagram, vidéo sur TikTok,
 * épingle (photo) sur Pinterest.
 */
const ROWS: Array<{ platform: Platform; format: Format }> = [
  { platform: "instagram", format: "photo" },
  { platform: "instagram", format: "carousel" },
  { platform: "instagram", format: "video" },
  { platform: "tiktok", format: "video" },
  { platform: "pinterest", format: "photo" },
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
  const [publicUrl, setPublicUrl] = useState<string | null>(recipe.publishing?.publicUrl ?? null);
  const [copied, setCopied] = useState(false);
  const [tiktokOpen, setTiktokOpen] = useState(false);
  const [schedule, setSchedule] = useState<ScheduledView[]>(recipe.publishing?.schedule ?? []);
  /** Ligne en cours de programmation (« instagram-photo »…), date choisie et créneau conseillé. */
  const [scheduling, setScheduling] = useState<string | null>(null);
  const [when, setWhen] = useState("");
  const [suggested, setSuggested] = useState<string | null | undefined>(undefined);
  /** Proposition de la planification automatique en cours de validation. */
  const [approving, setApproving] = useState<string | null>(null);
  /** Format demandé pour refaire la vidéo (vide = automatique) et demande en attente. */
  const [videoFormat, setVideoFormat] = useState("");
  const [videoRequested, setVideoRequested] = useState<string | null>(
    recipe.publishing?.video?.pendingRequest ?? null,
  );
  const [publishError, setPublishError] = useState<string | null>(null);
  const [captions, setCaptions] = useState<Record<Platform, string>>(
    recipe.publishing?.captions ?? { instagram: "", tiktok: "", pinterest: "" },
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

  const openSchedule = async (platform: Platform, kind: Format) => {
    setScheduling(`${platform}-${kind}`);
    setTiktokOpen(platform === "tiktok");
    setPublishError(null);
    setSuggested(undefined);
    setWhen("");
    const slot = await suggestSlotAction(platform).catch(() => null);
    setSuggested(slot);
    if (slot) setWhen(slot);
  };

  const closePanels = () => {
    setScheduling(null);
    setTiktokOpen(false);
    setApproving(null);
  };

  /** « Valider » une proposition : directement, ou après les choix TikTok. */
  const startApproval = (item: ScheduledView) => {
    const at = toParisInput(new Date(item.scheduledAt));
    setPublishError(null);
    if (item.platform === "tiktok") {
      setScheduling(`${item.platform}-${item.format}`);
      setApproving(item.id);
      setWhen(at);
      setSuggested(at);
      setTiktokOpen(true);
      return;
    }
    void submitApproval(item.id, item.platform, at, null);
  };

  const submitApproval = async (
    proposalId: string,
    platform: Platform,
    at: string,
    choices: TiktokChoices | null,
  ) => {
    setBusy(true);
    setError(false);
    setPublishError(null);
    const outcome = await approveProposalAction({
      recipeId: recipe.recipeId,
      proposalId,
      at,
      caption: captions[platform],
      tiktok: choices,
    }).catch(() => null);
    if (!outcome) setError(true);
    else if (!outcome.ok) setPublishError(t(`schedule.errors.${outcome.reason}`));
    else {
      setSchedule(outcome.schedule);
      closePanels();
    }
    setBusy(false);
  };

  const dismiss = async (proposalId: string) => {
    setBusy(true);
    setError(false);
    const next = await dismissProposalAction(recipe.recipeId, proposalId).catch(() => null);
    if (next) setSchedule(next);
    else setError(true);
    setBusy(false);
  };

  const rejectRecipe = async () => {
    setBusy(true);
    setError(false);
    const next = await rejectRecipeAction(recipe.recipeId).catch(() => null);
    if (next) setSchedule(next);
    else setError(true);
    setBusy(false);
  };

  const scheduleIt = async (platform: Platform, kind: Format, choices: TiktokChoices | null) => {
    if (approving) return submitApproval(approving, platform, when, choices);
    setBusy(true);
    setError(false);
    setPublishError(null);
    const outcome = await schedulePublicationAction({
      recipeId: recipe.recipeId,
      platform,
      format: kind,
      at: when,
      caption: captions[platform],
      tiktok: choices,
    }).catch(() => null);
    if (!outcome) setError(true);
    else if (!outcome.ok) setPublishError(t(`schedule.errors.${outcome.reason}`));
    else {
      setSchedule(outcome.schedule);
      closePanels();
    }
    setBusy(false);
  };

  const unschedule = async (scheduleId: string) => {
    setBusy(true);
    setError(false);
    const next = await cancelScheduleAction(recipe.recipeId, scheduleId).catch(() => null);
    if (next) setSchedule(next);
    else setError(true);
    setBusy(false);
  };

  const scheduleDate = (iso: string) =>
    format.dateTime(new Date(iso), {
      weekday: "short",
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "Europe/Paris",
    });

  const redoVideo = async () => {
    setBusy(true);
    setError(false);
    const ok = await requestVideoAction(recipe.recipeId, videoFormat).catch(() => false);
    if (ok) setVideoRequested(videoFormat || "auto");
    else setError(true);
    setBusy(false);
  };

  const proposedFirst = schedule.find((item) => item.status === "proposed");
  const scheduleDay = (iso: string) =>
    format.dateTime(new Date(iso), {
      weekday: "long",
      day: "numeric",
      month: "long",
      timeZone: "Europe/Paris",
    });

  const toggleShowcase = async (shown: boolean) => {
    setBusy(true);
    setError(false);
    const result = await setShowcaseAction(recipe.recipeId, shown).catch(() => null);
    if (result === null) setError(true);
    else setShowcase(result);
    setBusy(false);
  };

  const togglePublic = async (shown: boolean) => {
    setBusy(true);
    setError(false);
    const result = await setPublicPageAction(recipe.recipeId, shown).catch(() => undefined);
    if (!result) setError(true);
    else setPublicUrl(result.url);
    setCopied(false);
    setBusy(false);
  };

  const copyPublicUrl = async () => {
    if (!publicUrl) return;
    await navigator.clipboard?.writeText(publicUrl).catch(() => {});
    setCopied(true);
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
        {proposedFirst ? (
          <div
            className="flex flex-col gap-2 rounded-xl border border-border p-3"
            data-testid="autoplan-notice"
          >
            <p className="font-medium">
              {t("autoplan.title", { date: scheduleDay(proposedFirst.scheduledAt) })}
            </p>
            <p className="text-muted">{t("autoplan.intro")}</p>
            <div>
              <Button size="sm" variant="secondary" disabled={busy} onClick={rejectRecipe}>
                {t("autoplan.reject")}
              </Button>
            </div>
          </div>
        ) : null}
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
                {video.format ? (
                  <p>
                    {t("videoFormat.current", {
                      format: t(`videoFormat.names.${video.format}` as "videoFormat.names.eclate"),
                    })}
                  </p>
                ) : null}
                {video.current ? null : <Notice tone="warning">{t("video.outdated")}</Notice>}
                <p className="text-muted">{t("video.check")}</p>
                {videoRequested ? (
                  <Notice tone="info">
                    {t("videoFormat.requested", {
                      format: t(`videoFormat.names.${videoRequested}` as "videoFormat.names.eclate"),
                    })}
                  </Notice>
                ) : (
                  <div className="flex flex-wrap items-center gap-2" data-testid="video-redo">
                    <Select
                      value={videoFormat}
                      onChange={(e) => setVideoFormat(e.target.value)}
                      className="w-48"
                      aria-label={t("videoFormat.label")}
                    >
                      {["", "eclate", "coupe", "dessus", "geste"].map((value) => (
                        <option key={value} value={value}>
                          {t(`videoFormat.names.${value || "auto"}` as "videoFormat.names.eclate")}
                        </option>
                      ))}
                    </Select>
                    <Button size="sm" variant="secondary" disabled={busy} onClick={redoVideo}>
                      {t("videoFormat.redo")}
                    </Button>
                  </div>
                )}
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
          {(["instagram", "tiktok", "pinterest"] as const).map((platform) => (
            <label key={platform} className="flex flex-col gap-1">
              <span className="font-medium">{t("caption", { platform: t(`platforms.${platform}`) })}</span>
              <Textarea
                value={captions[platform]}
                maxLength={platform === "pinterest" ? 800 : 2200}
                rows={7}
                onChange={(e) => setCaptions((all) => ({ ...all, [platform]: e.target.value }))}
                data-testid={`caption-${platform}`}
              />
              <span className="text-xs text-muted">
                {t("captionHint", {
                  count: captions[platform].length,
                  max: platform === "pinterest" ? 800 : 2200,
                })}
              </span>
            </label>
          ))}
        </div>
        <ul className="flex flex-col divide-y divide-border">
          {ROWS.map(({ platform, format: kind }) => {
            const status = statusOf(platform, kind);
            const key = `${platform}-${kind}`;
            const planned = schedule.filter((p) => p.platform === platform && p.format === kind);
            const schedulingThis = scheduling === key;
            // Proposition en attente : ses boutons remplacent « Valider et publier » et « Programmer ».
            const hasProposal = planned.some((p) => p.status === "proposed");
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
                {planned.map((item) =>
                  item.status === "proposed" ? (
                    <div
                      key={item.id}
                      className="flex flex-col gap-2 rounded-xl bg-background p-3"
                      data-testid={`proposed-${key}`}
                    >
                      <div>
                        <Badge tone="warning">
                          {t("autoplan.proposed", { date: scheduleDate(item.scheduledAt) })}
                        </Badge>
                      </div>
                      {!connected(platform) ? (
                        <p className="text-muted">
                          {t.rich("notConnected", {
                            link: (chunks) => (
                              <Link href="/admin/reseaux" className="text-primary hover:underline">
                                {chunks}
                              </Link>
                            ),
                          })}
                        </p>
                      ) : ready(kind) ? (
                        approving === item.id ? null : (
                          <div className="flex flex-wrap gap-2">
                            <Button
                              size="sm"
                              disabled={busy || !connected(platform)}
                              data-testid={`approve-${key}`}
                              onClick={() => startApproval(item)}
                            >
                              {t("autoplan.approve")}
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              disabled={busy}
                              onClick={() => dismiss(item.id)}
                            >
                              {t("autoplan.dismiss")}
                            </Button>
                          </div>
                        )
                      ) : (
                        <p className="text-muted">
                          {kind === "video"
                            ? t("autoplan.waitingVideo")
                            : kind === "carousel"
                              ? t("autoplan.waitingCarousel")
                              : t("autoplan.waitingPhoto")}
                        </p>
                      )}
                    </div>
                  ) : item.status === "expired" ? (
                    <p key={item.id} className="text-muted">
                      {t("autoplan.expired", { date: scheduleDate(item.scheduledAt) })}
                    </p>
                  ) : item.status === "scheduled" ? (
                    <div
                      key={item.id}
                      className="flex flex-wrap items-center gap-2"
                      data-testid={`scheduled-${key}`}
                    >
                      <Badge tone="accent">
                        {t("schedule.scheduled", { date: scheduleDate(item.scheduledAt) })}
                      </Badge>
                      <Button size="sm" variant="ghost" disabled={busy} onClick={() => unschedule(item.id)}>
                        {t("schedule.unschedule")}
                      </Button>
                    </div>
                  ) : (
                    <Notice key={item.id} tone="danger">
                      {t("schedule.failedRun", {
                        date: scheduleDate(item.scheduledAt),
                        note: item.note ?? "",
                      })}
                    </Notice>
                  ),
                )}
                {ready(kind) &&
                status?.status !== "processing" &&
                !(hasProposal && !(platform === "tiktok" && tiktokOpen)) ? (
                  connected(platform) ? (
                    platform === "tiktok" && tiktokOpen ? (
                      <TiktokPublishPanel
                        busy={busy || (schedulingThis && !when)}
                        onPublish={(choices) =>
                          schedulingThis
                            ? scheduleIt("tiktok", "video", choices)
                            : publish("tiktok", "video", choices)
                        }
                        onCancel={closePanels}
                        scheduleField={
                          schedulingThis ? (
                            <ScheduleField when={when} suggested={suggested} onChange={setWhen} />
                          ) : undefined
                        }
                      />
                    ) : schedulingThis ? (
                      <div
                        className="flex flex-col gap-3 rounded-xl border border-border p-3"
                        data-testid="schedule-panel"
                      >
                        <p className="font-medium">{t("schedule.title")}</p>
                        <ScheduleField when={when} suggested={suggested} onChange={setWhen} />
                        <div className="flex flex-wrap gap-2">
                          <Button
                            size="sm"
                            disabled={busy || !when}
                            data-testid={`schedule-confirm-${key}`}
                            onClick={() => scheduleIt(platform, kind, null)}
                          >
                            {t("schedule.confirm")}
                          </Button>
                          <Button size="sm" variant="ghost" onClick={closePanels}>
                            {t("schedule.cancel")}
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex flex-wrap gap-2">
                        <Button
                          size="sm"
                          variant={status?.status === "published" ? "secondary" : "primary"}
                          disabled={busy}
                          data-testid={`publish-${key}`}
                          onClick={() => {
                            setScheduling(null);
                            if (platform === "tiktok") setTiktokOpen(true);
                            else void publish(platform, kind, null);
                          }}
                        >
                          {status?.status === "published"
                            ? t("publishAgain")
                            : t("publishOn", { platform: t(`platforms.${platform}`) })}
                        </Button>
                        <Button
                          size="sm"
                          variant="secondary"
                          disabled={busy}
                          data-testid={`schedule-${key}`}
                          onClick={() => openSchedule(platform, kind)}
                        >
                          {t("schedule.button")}
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
        <div className="flex flex-col gap-2 border-t border-border pt-4" data-testid="public-page">
          <label className="flex items-start gap-3">
            <input
              type="checkbox"
              className="mt-0.5 size-4 accent-primary"
              checked={publicUrl !== null}
              disabled={busy}
              onChange={(e) => togglePublic(e.target.checked)}
              data-testid="public-page-toggle"
            />
            <span>
              <span className="font-medium">{t("publicPage")}</span>
              <span className="block text-muted">{t("publicPageHint")}</span>
            </span>
          </label>
          {publicUrl ? (
            <div className="flex flex-wrap items-center gap-2 pl-7">
              <a
                href={publicUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="break-all text-primary hover:underline"
                data-testid="public-page-url"
              >
                {publicUrl.replace(/^https?:\/\//, "")}
              </a>
              <Button variant="secondary" size="sm" onClick={copyPublicUrl}>
                {copied ? t("publicPageCopied") : t("publicPageCopy")}
              </Button>
            </div>
          ) : null}
        </div>
      </CardBody>
    </Card>
  );
}
