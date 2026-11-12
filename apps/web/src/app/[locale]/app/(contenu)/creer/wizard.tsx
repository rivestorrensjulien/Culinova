"use client";

import { SERVINGS_PRESETS } from "@culinova/core";
import {
  Badge,
  Button,
  buttonClasses,
  Card,
  CardBody,
  cx,
  Input,
  Notice,
  Progress,
  Spinner,
  Textarea,
} from "@culinova/ui";
import { useLocale, useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState } from "react";
import { RecipeView } from "@/components/recipe/recipe-view";
import { SocialContentView } from "@/components/recipe/social-content";
import { Link, useRouter } from "@/i18n/navigation";
import { formatResetDate } from "@/lib/dates";
import {
  BUDGET_PRESETS_CENTS,
  COOKING_LEVELS,
  KITCHEN_EQUIPMENT,
  MAX_INPUT_LENGTH,
  missingFields,
  TIME_PRESETS_MINUTES,
  type WizardState,
  type WizardStepKey,
  withHomeDefaults,
  wizardSteps,
} from "@/lib/wizard";
import {
  draftStatusAction,
  generationFailureAction,
  generationStatusAction,
  newDraftAction,
  recipeViewAction,
  regenerateAction,
  startGenerationAction,
  toggleFavoriteCuisineAction,
} from "@/server/actions/wizard";
import type { CulinaryReference } from "@/server/generation/reference";
import type { StartResult } from "@/server/generation/start";
import type { RecipeView as RecipeData } from "@/server/generation/view";
import { PrecisionStep } from "./precision-step";
import { Chip, SelectCard } from "./select-card";
import { type SaveStatus, useAutosave } from "./use-autosave";

export interface WizardProps {
  draft: {
    id: string;
    status: "editing" | "generating" | "done" | "failed" | "archived";
    error: string | null;
    state: WizardState;
    clientUpdatedAt: string | null;
    recipeId: string | null;
  };
  reference: CulinaryReference;
  /** Mode pro du compte (libellés du coût). */
  proMode?: boolean;
  favorites: string[];
  recents: string[];
  usage: { used: number; limit: number | null };
  initialRecipe: RecipeData | null;
}

type Problem =
  { kind: "start"; result: Exclude<StartResult, { ok: true }> } | { kind: "failed"; code: string };

const POLL_MS = 2000;

function SaveIndicator({ status }: { status: SaveStatus }) {
  const t = useTranslations("Wizard.save");
  return (
    <span
      className="flex items-center gap-1.5 text-xs text-muted"
      role="status"
      data-testid="save-status"
      data-status={status}
    >
      <span
        className={cx(
          "size-2 rounded-full",
          status === "saved" ? "bg-success" : status === "saving" ? "animate-pulse bg-warning" : "bg-danger",
        )}
      />
      {t(status)}
    </span>
  );
}

export function Wizard({
  draft,
  reference,
  favorites: initialFavorites,
  recents,
  usage,
  initialRecipe,
  proMode = false,
}: WizardProps) {
  const t = useTranslations("Wizard");
  const locale = useLocale();
  const router = useRouter();
  const {
    state,
    setState,
    status: saveStatus,
    flush,
  } = useAutosave(draft.id, draft.state, draft.clientUpdatedAt);
  const [recipe, setRecipe] = useState<RecipeData | null>(initialRecipe);
  const [generating, setGenerating] = useState(draft.status === "generating");
  const [problem, setProblem] = useState<Problem | null>(
    draft.status === "failed" && draft.error ? { kind: "failed", code: draft.error } : null,
  );
  const [used, setUsed] = useState(usage.used);
  const [favorites, setFavorites] = useState(initialFavorites);
  const [regenerating, setRegenerating] = useState<string | null>(initialRecipe?.pendingGenerationId ?? null);
  const [instruction, setInstruction] = useState("");
  const headingRef = useRef<HTMLHeadingElement>(null);

  // Parcours pro (12 étapes) ou parcours court des particuliers.
  const steps = wizardSteps(proMode);
  const at = (name: WizardStepKey) => steps.indexOf(name) + 1;
  const GENERATION_STEP = at("generation");
  const RESULT_STEP = at("result");

  const update = useCallback(
    (patch: Partial<WizardState>) =>
      setState((s) => (proMode ? { ...s, ...patch } : withHomeDefaults({ ...s, ...patch }))),
    [setState, proMode],
  );
  const goTo = useCallback(
    (step: number) => {
      update({ step });
      requestAnimationFrame(() => headingRef.current?.focus());
    },
    [update],
  );

  // Suivi d'une génération en cours (y compris après un rafraîchissement de la page).
  useEffect(() => {
    if (!generating) return;
    let stopped = false;
    const poll = async () => {
      const current = await draftStatusAction(draft.id).catch(() => null);
      if (stopped || !current) return;
      if (current.status === "done" && current.recipeId) {
        const view = await recipeViewAction(current.recipeId);
        if (stopped) return;
        setRecipe(view);
        setGenerating(false);
        update({ step: RESULT_STEP });
        router.refresh();
      } else if (current.status === "failed") {
        setGenerating(false);
        setUsed((n) => Math.max(0, n - 1));
        setProblem({ kind: "failed", code: current.error ?? "unexpected" });
      }
    };
    const id = setInterval(() => void poll(), POLL_MS);
    void poll();
    return () => {
      stopped = true;
      clearInterval(id);
    };
  }, [generating, draft.id, update, router, RESULT_STEP]);

  // Suivi d'une régénération.
  useEffect(() => {
    if (!regenerating || !recipe) return;
    let stopped = false;
    const id = setInterval(async () => {
      const current = await generationStatusAction(regenerating).catch(() => null);
      if (stopped || !current || current === "queued" || current === "running") return;
      if (current === "failed") {
        const code = await generationFailureAction(regenerating).catch(() => "unexpected");
        setProblem({ kind: "failed", code });
      }
      setRecipe(await recipeViewAction(recipe.recipeId));
      setRegenerating(null);
    }, POLL_MS);
    return () => {
      stopped = true;
      clearInterval(id);
    };
  }, [regenerating, recipe]);

  const generate = async () => {
    setProblem(null);
    await flush();
    const result = await startGenerationAction(draft.id);
    if (result.ok) {
      setUsed((n) => n + 1);
      setGenerating(true);
    } else {
      setProblem({ kind: "start", result });
    }
  };

  const regenerate = async () => {
    if (!recipe) return;
    setProblem(null);
    const result = await regenerateAction(recipe.recipeId, instruction || null);
    if (result.ok) {
      setRegenerating(result.generationId);
      setInstruction("");
    } else {
      setProblem({ kind: "start", result });
    }
  };

  const startOver = async () => {
    await newDraftAction();
    router.refresh();
  };

  const toggleFavorite = async (code: string) => {
    const now = await toggleFavoriteCuisineAction(code);
    setFavorites((list) =>
      now ? [...list.filter((c) => c !== code), code] : list.filter((c) => c !== code),
    );
  };

  const problemText = (p: Problem): string => {
    if (p.kind === "failed")
      return t.has(`errors.${p.code}`)
        ? t(`errors.${p.code}` as "errors.unexpected")
        : t("errors.unexpected");
    const r = p.result;
    if (r.reason === "quota") {
      if (r.metric === "regenerations") return t("errors.quotaRegen", { limit: r.limit ?? 0 });
      return t("errors.quota", {
        limit: r.limit ?? 0,
        date: r.resetsOn ? formatResetDate(r.resetsOn, locale) : "",
      });
    }
    return t(`errors.${r.reason}`);
  };

  const hasRecipe = Boolean(recipe);
  const step = hasRecipe ? Math.max(state.step, RESULT_STEP) : Math.min(state.step, GENERATION_STEP);
  const key = steps[step - 1]!;
  const fusion = state.cuisineCodes.length > 1;
  const remaining = usage.limit === null ? null : Math.max(0, usage.limit - used);

  const canContinue: Partial<Record<WizardStepKey, boolean>> = {
    moment: Boolean(state.momentCode),
    influence: Boolean(state.influenceCode),
    precision: true,
    style: Boolean(state.styleCode),
    language: true,
    mode: Boolean(state.mode),
    input: state.input.trim().length >= 2,
    servings: state.servings >= 1,
    result: true,
    social: true,
    wish: Boolean(state.momentCode && state.mode) && state.input.trim().length >= 2,
    practical: state.servings >= 1,
    kitchen: (state.equipment?.length ?? 0) > 0,
  };
  const euros = (cents: number) =>
    new Intl.NumberFormat(locale, { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(
      cents / 100,
    );
  const equipment = state.equipment ?? [];

  const label = {
    moment: reference.moments.find((m) => m.code === state.momentCode)?.label,
    influence:
      state.influenceCode === "none"
        ? t("noInfluence")
        : reference.influences.find((i) => i.code === state.influenceCode)?.label,
    precision:
      [
        reference.regions.find((r) => r.code === state.regionCode)?.label,
        reference.countries.find((c) => c.iso === state.countryIso)?.label,
        state.cuisineCodes.map((c) => reference.cuisines.find((x) => x.code === c)?.label).join(" × ") ||
          null,
      ]
        .filter(Boolean)
        .join(" › ") || t("none"),
    style: reference.styles.find((s) => s.code === state.styleCode)?.label,
    language: t(`languages.${state.language}`),
    mode: state.mode ? t(`modes.${state.mode}.title`) : undefined,
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm text-muted">{t("stepOf", { current: step, total: steps.length })}</p>
          <h1 ref={headingRef} tabIndex={-1} className="font-display text-4xl outline-none">
            {key === "input" && state.mode
              ? t(`inputQuestion.${state.mode}`)
              : t(`questions.${key === "input" ? "mode" : key}` as "questions.mode")}
          </h1>
        </div>
        <div className="flex items-center gap-3">
          <SaveIndicator status={saveStatus} />
          {hasRecipe ? (
            <Button variant="secondary" size="sm" onClick={startOver}>
              {t("newRecipe")}
            </Button>
          ) : null}
        </div>
      </div>

      <nav aria-label={t("title")} className="flex flex-col gap-2">
        <Progress
          value={step}
          max={steps.length}
          label={t("stepOf", { current: step, total: steps.length })}
        />
        <ol className="hidden flex-wrap gap-x-3 gap-y-1 text-xs text-muted md:flex">
          {steps.map((name, index) => {
            const n = index + 1;
            const reachable = hasRecipe ? n >= RESULT_STEP : n <= GENERATION_STEP && n <= state.step;
            return (
              <li key={name}>
                <button
                  type="button"
                  disabled={!reachable || generating}
                  onClick={() => goTo(n)}
                  aria-current={n === step ? "step" : undefined}
                  className={cx(
                    "cursor-pointer disabled:cursor-default",
                    n === step
                      ? "font-medium text-foreground"
                      : reachable
                        ? "hover:text-foreground"
                        : "opacity-50",
                  )}
                >
                  {n}. {t(`steps.${name}` as "steps.moment")}
                </button>
              </li>
            );
          })}
        </ol>
      </nav>

      {problem ? <Notice tone="danger">{problemText(problem)}</Notice> : null}

      <section className="min-h-64">
        {key === "wish" && (
          <div className="flex flex-col gap-6">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {(["ingredients", "idea"] as const).map((m) => (
                <SelectCard
                  key={m}
                  title={t(`home.modes.${m}.title`)}
                  hint={t(`home.modes.${m}.hint`)}
                  selected={state.mode === m}
                  onSelect={() => update({ mode: m })}
                />
              ))}
            </div>
            {state.mode ? (
              <Textarea
                value={state.input}
                maxLength={MAX_INPUT_LENGTH}
                rows={5}
                aria-label={t(`inputQuestion.${state.mode}`)}
                placeholder={t(`home.placeholder.${state.mode === "ingredients" ? "ingredients" : "idea"}`)}
                onChange={(e) => update({ input: e.target.value })}
                className="text-base"
                data-testid="home-input"
              />
            ) : null}
            <fieldset className="flex flex-col gap-2">
              <legend className="mb-2 text-sm font-medium">{t("home.moment")}</legend>
              <div className="flex flex-wrap gap-2">
                {reference.moments.map((m) => (
                  <Chip
                    key={m.code}
                    selected={state.momentCode === m.code}
                    onClick={() => update({ momentCode: m.code })}
                  >
                    {m.label}
                  </Chip>
                ))}
              </div>
            </fieldset>
          </div>
        )}

        {key === "practical" && (
          <div className="flex flex-col gap-6">
            <fieldset className="flex flex-col gap-2">
              <legend className="mb-2 text-sm font-medium">{t("home.servings")}</legend>
              <div className="flex flex-wrap items-center gap-2">
                {SERVINGS_PRESETS.map((n) => (
                  <Chip key={n} selected={state.servings === n} onClick={() => update({ servings: n })}>
                    {n}
                  </Chip>
                ))}
              </div>
            </fieldset>
            <fieldset className="flex flex-col gap-2">
              <legend className="mb-2 text-sm font-medium">{t("home.budget")}</legend>
              <div className="flex flex-wrap gap-2">
                <Chip
                  selected={state.budgetPerServingCents === null}
                  onClick={() => update({ budgetPerServingCents: null })}
                >
                  {t("home.noLimit")}
                </Chip>
                {BUDGET_PRESETS_CENTS.map((cents) => (
                  <Chip
                    key={cents}
                    selected={state.budgetPerServingCents === cents}
                    onClick={() => update({ budgetPerServingCents: cents })}
                  >
                    {t("home.perPerson", { amount: euros(cents) })}
                  </Chip>
                ))}
              </div>
            </fieldset>
            <fieldset className="flex flex-col gap-2">
              <legend className="mb-2 text-sm font-medium">{t("home.time")}</legend>
              <div className="flex flex-wrap gap-2">
                <Chip selected={state.maxMinutes === null} onClick={() => update({ maxMinutes: null })}>
                  {t("home.noRush")}
                </Chip>
                {TIME_PRESETS_MINUTES.map((minutes) => (
                  <Chip
                    key={minutes}
                    selected={state.maxMinutes === minutes}
                    onClick={() => update({ maxMinutes: minutes })}
                  >
                    {t("home.minutes", { count: minutes })}
                  </Chip>
                ))}
              </div>
            </fieldset>
          </div>
        )}

        {key === "kitchen" && (
          <div className="flex flex-col gap-6">
            <fieldset className="flex flex-col gap-2">
              <legend className="mb-2 text-sm font-medium">{t("home.level")}</legend>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                {COOKING_LEVELS.map((level) => (
                  <SelectCard
                    key={level}
                    title={t(`home.levels.${level}.title`)}
                    hint={t(`home.levels.${level}.hint`)}
                    selected={(state.level ?? "comfortable") === level}
                    onSelect={() => update({ level })}
                  />
                ))}
              </div>
            </fieldset>
            <fieldset className="flex flex-col gap-2">
              <legend className="mb-2 text-sm font-medium">{t("home.equipment")}</legend>
              <div className="flex flex-wrap gap-2">
                {KITCHEN_EQUIPMENT.map((code) => (
                  <Chip
                    key={code}
                    selected={equipment.includes(code)}
                    onClick={() =>
                      update({
                        equipment: equipment.includes(code)
                          ? equipment.filter((c) => c !== code)
                          : [...equipment, code],
                      })
                    }
                  >
                    {t(`home.appliances.${code}`)}
                  </Chip>
                ))}
              </div>
              <p className="text-sm text-muted">{t("home.equipmentHint")}</p>
            </fieldset>
          </div>
        )}

        {key === "moment" && (
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {reference.moments.map((m) => (
              <SelectCard
                key={m.code}
                title={m.label}
                selected={state.momentCode === m.code}
                onSelect={() => {
                  update({ momentCode: m.code, step: 2 });
                }}
              />
            ))}
          </div>
        )}

        {key === "influence" && (
          <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
            <SelectCard
              title={t("noInfluence")}
              hint={t("noInfluenceHint")}
              selected={state.influenceCode === "none"}
              onSelect={() => update({ influenceCode: "none", regionCode: null, countryIso: null, step: 3 })}
            />
            {reference.influences.map((i) => (
              <SelectCard
                key={i.code}
                title={i.label}
                selected={state.influenceCode === i.code}
                onSelect={() =>
                  update({
                    influenceCode: i.code,
                    regionCode: state.influenceCode === i.code ? state.regionCode : null,
                    countryIso: state.influenceCode === i.code ? state.countryIso : null,
                    step: 3,
                  })
                }
              />
            ))}
          </div>
        )}

        {key === "precision" && (
          <PrecisionStep
            reference={reference}
            state={state}
            update={update}
            favorites={favorites}
            recents={recents}
            onToggleFavorite={toggleFavorite}
          />
        )}

        {key === "style" && (
          <div className="flex flex-col gap-3">
            {fusion ? <Notice>{t("traditionalDisabled")}</Notice> : null}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {reference.styles.map((s) => (
                <SelectCard
                  key={s.code}
                  title={s.label}
                  hint={s.description}
                  disabled={fusion && !s.allowsFusion}
                  selected={state.styleCode === s.code}
                  onSelect={() => update({ styleCode: s.code, step: 5 })}
                />
              ))}
            </div>
          </div>
        )}

        {key === "language" && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {(["fr", "en"] as const).map((l) => (
              <SelectCard
                key={l}
                title={t(`languages.${l}`)}
                selected={state.language === l}
                onSelect={() => update({ language: l, step: 6 })}
              />
            ))}
          </div>
        )}

        {key === "mode" && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {(["ingredients", "name", "idea"] as const).map((m) => (
              <SelectCard
                key={m}
                title={t(`modes.${m}.title`)}
                hint={t(`modes.${m}.hint`)}
                selected={state.mode === m}
                onSelect={() => update({ mode: m, step: 7 })}
              />
            ))}
          </div>
        )}

        {key === "input" && state.mode && (
          <Textarea
            value={state.input}
            maxLength={MAX_INPUT_LENGTH}
            rows={7}
            aria-label={t(`inputQuestion.${state.mode}`)}
            placeholder={t(`inputPlaceholder.${state.mode}`)}
            onChange={(e) => update({ input: e.target.value })}
            className="text-base"
          />
        )}

        {key === "servings" && (
          <div className="flex flex-wrap items-center gap-2">
            {SERVINGS_PRESETS.map((n) => (
              <Chip key={n} selected={state.servings === n} onClick={() => update({ servings: n })}>
                {n}
              </Chip>
            ))}
            <label className="ml-2 flex items-center gap-2 text-sm">
              {t("custom")}
              <Input
                type="number"
                min={1}
                max={200}
                className="w-24"
                value={state.servings}
                onChange={(e) => {
                  const n = Number.parseInt(e.target.value, 10);
                  if (Number.isInteger(n) && n >= 1 && n <= 200) update({ servings: n });
                }}
              />
            </label>
          </div>
        )}

        {key === "generation" && (
          <div className="flex flex-col gap-6">
            <Card>
              <CardBody>
                <dl
                  className="grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-[auto_1fr_auto]"
                  data-testid="summary"
                >
                  {(proMode
                    ? ([
                        ["moment", label.moment, 1],
                        ["influence", label.influence, 2],
                        ["precision", label.precision, 3],
                        ["style", label.style, 4],
                        ["language", label.language, 5],
                        ["mode", label.mode, 6],
                        ["input", state.input, 7],
                        ["servings", String(state.servings), 8],
                      ] as const)
                    : ([
                        ["input", state.input, at("wish")],
                        ["moment", label.moment, at("wish")],
                        ["servings", String(state.servings), at("practical")],
                        [
                          "budget",
                          state.budgetPerServingCents
                            ? t("home.perPerson", { amount: euros(state.budgetPerServingCents) })
                            : t("home.noLimit"),
                          at("practical"),
                        ],
                        [
                          "time",
                          state.maxMinutes
                            ? t("home.minutes", { count: state.maxMinutes })
                            : t("home.noRush"),
                          at("practical"),
                        ],
                        ["level", t(`home.levels.${state.level ?? "comfortable"}.title`), at("kitchen")],
                        [
                          "equipment",
                          equipment.map((code) => t(`home.appliances.${code}`)).join(", "),
                          at("kitchen"),
                        ],
                      ] as const)
                  ).map(([name, value, target]) => (
                    <div key={name} className="contents">
                      <dt className="text-muted">{t(`summary.${name}` as "summary.moment")}</dt>
                      <dd className="whitespace-pre-line">{value || "—"}</dd>
                      <dd>
                        {!generating ? (
                          <button
                            type="button"
                            className="cursor-pointer text-primary hover:underline"
                            onClick={() => goTo(target)}
                          >
                            {t("summary.edit")}
                          </button>
                        ) : null}
                      </dd>
                    </div>
                  ))}
                </dl>
                {fusion ? (
                  <Badge tone="sage" className="mt-4">
                    {t("fusion")}
                  </Badge>
                ) : null}
              </CardBody>
            </Card>
            {generating ? (
              <div className="flex flex-col items-start gap-2" data-testid="generating">
                <p className="flex items-center gap-2 font-display text-2xl">
                  <Spinner /> {t("generating")}
                </p>
                <p className="text-sm text-muted">{t("generatingHint")}</p>
              </div>
            ) : (
              <div className="flex flex-wrap items-center gap-4">
                <Button
                  size="lg"
                  onClick={generate}
                  disabled={missingFields(state).length > 0 || remaining === 0}
                >
                  {problem ? t("retry") : t("generate")}
                </Button>
                <span className="text-sm text-muted" data-testid="remaining">
                  {remaining === null ? t("unlimited") : t("remaining", { count: remaining })}
                </span>
              </div>
            )}
          </div>
        )}

        {key === "result" && recipe && (
          <RecipeView
            recipe={recipe}
            proMode={proMode}
            actions={
              <Card>
                <CardBody className="flex flex-col gap-3">
                  <p className="text-sm text-muted">{t("imageSoon")}</p>
                  <Button variant="secondary" size="sm" disabled>
                    {t("regenerateImage")}
                  </Button>
                  <hr className="border-border" />
                  {regenerating ? (
                    <p className="flex items-center gap-2 text-sm" data-testid="regenerating">
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
                        onClick={regenerate}
                        disabled={
                          recipe.regenerations.limit !== null &&
                          recipe.regenerations.used >= recipe.regenerations.limit
                        }
                      >
                        {t("regenerate")}
                      </Button>
                      {recipe.regenerations.limit !== null ? (
                        <span className="text-xs text-muted">
                          {t("regenerateRemaining", {
                            count: Math.max(0, recipe.regenerations.limit - recipe.regenerations.used),
                          })}
                        </span>
                      ) : null}
                    </>
                  )}
                </CardBody>
              </Card>
            }
          />
        )}

        {key === "social" && recipe && <SocialContentView social={recipe.social} />}

        {key === "saved" && recipe && (
          <Card>
            <CardBody className="flex flex-col items-start gap-4">
              <p className="font-display text-2xl">{recipe.name}</p>
              <p className="text-muted">{t("savedBody")}</p>
              <div className="flex flex-wrap gap-3">
                <Link href={`/app/recettes/${recipe.recipeId}`} className={buttonClasses("primary")}>
                  {t("openRecipe")}
                </Link>
                <Button variant="secondary" onClick={startOver}>
                  {t("newRecipe")}
                </Button>
              </div>
            </CardBody>
          </Card>
        )}
      </section>

      {!generating && key !== "generation" && key !== "saved" ? (
        <div className="flex items-center justify-between border-t border-border pt-4">
          <Button
            variant="ghost"
            onClick={() => goTo(step - 1)}
            disabled={step === 1 || (hasRecipe && step === RESULT_STEP)}
          >
            {t("back")}
          </Button>
          <Button onClick={() => goTo(step + 1)} disabled={!canContinue[key]}>
            {t("next")}
          </Button>
        </div>
      ) : null}
      {key === "generation" && !generating ? (
        <div className="border-t border-border pt-4">
          <Button variant="ghost" onClick={() => goTo(step - 1)}>
            {t("back")}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
