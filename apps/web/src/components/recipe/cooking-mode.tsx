"use client";

import { Button, cx } from "@culinova/ui";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "@/i18n/navigation";
import type { RecipeView as RecipeData } from "@/server/generation/view";
import { platingText } from "./format";
import { useRecipeText } from "./use-recipe-text";

interface Timer {
  stepIndex: number;
  totalS: number;
  /** Fin prévue (ms) quand il tourne, sinon null. */
  endsAt: number | null;
  /** Temps restant quand il est en pause (s). */
  remainingS: number;
  done: boolean;
}

/** « 4:05 », « 1:02:30 ». */
export function clock(seconds: number): string {
  const s = Math.max(0, Math.ceil(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${sec}` : `${m}:${sec}`;
}

function remainingOf(timer: Timer, now: number): number {
  return timer.endsAt === null ? timer.remainingS : Math.max(0, (timer.endsAt - now) / 1000);
}

/** Sonnerie courte (trois bips) et vibration, sans fichier audio. */
function ring() {
  try {
    const audio = new AudioContext();
    [0, 0.35, 0.7].forEach((offset) => {
      const osc = audio.createOscillator();
      const gain = audio.createGain();
      osc.frequency.value = 880;
      gain.gain.setValueAtTime(0.25, audio.currentTime + offset);
      gain.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + offset + 0.3);
      osc.connect(gain).connect(audio.destination);
      osc.start(audio.currentTime + offset);
      osc.stop(audio.currentTime + offset + 0.3);
    });
  } catch {
    // Son indisponible : la vibration et l'affichage suffisent.
  }
  navigator.vibrate?.([300, 150, 300]);
}

/**
 * Mode préparation : la recette étape par étape, en plein écran, avec les quantités
 * de l'étape, des minuteurs qui continuent quand on change d'étape, et l'écran maintenu allumé.
 */
export function CookingMode({ recipe }: { recipe: RecipeData }) {
  const t = useTranslations("Prep");
  const tr = useTranslations("Recipe");
  const router = useRouter();
  const [servings, setServings] = useState(recipe.servings);
  const { amountText, stepText } = useRecipeText(recipe, recipe.servings, servings);
  // -1 : mise en place ; steps.length : dressage.
  const [index, setIndex] = useState(-1);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [timers, setTimers] = useState<Timer[]>([]);
  const [now, setNow] = useState(() => Date.now());
  const steps = recipe.steps;
  const last = steps.length;
  const exitHref = `/app/recettes/${recipe.recipeId}`;

  const go = useCallback((next: number) => setIndex(Math.max(-1, Math.min(last, next))), [last]);

  // Écran maintenu allumé (si le navigateur le permet).
  useEffect(() => {
    let lock: { release: () => Promise<void> } | null = null;
    const request = async () => {
      try {
        lock =
          (await (
            navigator as Navigator & {
              wakeLock?: { request: (type: "screen") => Promise<{ release: () => Promise<void> }> };
            }
          ).wakeLock?.request("screen")) ?? null;
      } catch {
        lock = null;
      }
    };
    void request();
    const onVisible = () => {
      if (document.visibilityState === "visible") void request();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      void lock?.release().catch(() => undefined);
    };
  }, []);

  // Horloge des minuteurs et sonnerie à la fin.
  const timersRef = useRef(timers);
  useEffect(() => {
    timersRef.current = timers;
  }, [timers]);
  useEffect(() => {
    if (!timers.some((timer) => timer.endsAt !== null)) return;
    const id = setInterval(() => {
      const current = Date.now();
      setNow(current);
      const finished = timersRef.current.filter((timer) => timer.endsAt !== null && timer.endsAt <= current);
      if (finished.length > 0) {
        ring();
        setTimers((all) =>
          all.map((timer) =>
            finished.some((f) => f.stepIndex === timer.stepIndex)
              ? { ...timer, endsAt: null, remainingS: 0, done: true }
              : timer,
          ),
        );
      }
    }, 250);
    return () => clearInterval(id);
  }, [timers]);

  // Clavier : flèches pour changer d'étape, Échap pour quitter.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.target as HTMLElement | null)?.tagName === "INPUT") return;
      if (event.key === "ArrowRight") go(index + 1);
      else if (event.key === "ArrowLeft") go(index - 1);
      else if (event.key === "Escape") router.push(exitHref);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go, index, router, exitHref]);

  const timerOf = (stepIndex: number) => timers.find((timer) => timer.stepIndex === stepIndex);
  const startTimer = (stepIndex: number, totalS: number) => {
    const existing = timerOf(stepIndex);
    const remaining = existing && !existing.done ? remainingOf(existing, Date.now()) : totalS;
    setNow(Date.now());
    setTimers((all) => [
      ...all.filter((timer) => timer.stepIndex !== stepIndex),
      { stepIndex, totalS, endsAt: Date.now() + remaining * 1000, remainingS: remaining, done: false },
    ]);
  };
  const pauseTimer = (stepIndex: number) =>
    setTimers((all) =>
      all.map((timer) =>
        timer.stepIndex === stepIndex && timer.endsAt !== null
          ? { ...timer, endsAt: null, remainingS: remainingOf(timer, Date.now()) }
          : timer,
      ),
    );
  const resetTimer = (stepIndex: number) =>
    setTimers((all) => all.filter((timer) => timer.stepIndex !== stepIndex));

  const step = index >= 0 && index < last ? steps[index]! : null;
  const stepIngredients = step
    ? step.ingredientIds.flatMap((id) => recipe.ingredients.filter((i) => i.id === id))
    : [];
  const activeTimers = timers.filter((timer) => timer.endsAt !== null || timer.done);
  const progress = ((index + 1) / (last + 1)) * 100;

  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-background" data-testid="cooking-mode">
      <header className="flex items-center justify-between gap-3 border-b border-border px-4 py-3 sm:px-8">
        <div className="min-w-0">
          <p className="text-xs tracking-wide text-muted uppercase">{t("title")}</p>
          <p className="truncate font-display text-lg">{recipe.name}</p>
        </div>
        <Button variant="ghost" size="sm" onClick={() => router.push(exitHref)}>
          {t("exit")}
        </Button>
      </header>
      <div className="h-1 bg-raised">
        <div className="h-full bg-primary transition-[width]" style={{ width: `${progress}%` }} />
      </div>

      {activeTimers.length > 0 ? (
        <div
          className="flex flex-wrap gap-2 border-b border-border px-4 py-2 sm:px-8"
          aria-label={t("timers")}
        >
          {activeTimers.map((timer) => (
            <button
              key={timer.stepIndex}
              type="button"
              onClick={() => go(timer.stepIndex)}
              className={cx(
                "cursor-pointer rounded-full border px-3 py-1 text-sm tabular-nums",
                timer.done ? "animate-pulse border-primary bg-primary text-background" : "border-border",
              )}
              data-testid="running-timer"
            >
              {t("stepShort", { number: timer.stepIndex + 1 })} ·{" "}
              {timer.done ? t("timerDone") : clock(remainingOf(timer, now))}
            </button>
          ))}
        </div>
      ) : null}

      <main className="flex-1 overflow-y-auto px-4 py-8 sm:px-8">
        <div className="mx-auto flex max-w-3xl flex-col gap-6">
          {index === -1 ? (
            <>
              <h1 className="font-display text-4xl">{t("miseEnPlace")}</h1>
              <p className="text-muted">{t("miseEnPlaceHint")}</p>
              <div className="flex items-center gap-2" role="group" aria-label={tr("servingsLabel")}>
                <Button
                  size="sm"
                  variant="secondary"
                  aria-label={tr("less")}
                  disabled={servings <= 1}
                  onClick={() => setServings((n) => Math.max(1, n - 1))}
                >
                  −
                </Button>
                <span className="min-w-28 text-center font-medium" data-testid="prep-servings">
                  {tr("servings", { count: servings })}
                </span>
                <Button
                  size="sm"
                  variant="secondary"
                  aria-label={tr("more")}
                  disabled={servings >= 200}
                  onClick={() => setServings((n) => Math.min(200, n + 1))}
                >
                  +
                </Button>
              </div>
              <ul className="flex flex-col divide-y divide-border rounded-lg border border-border bg-surface">
                {recipe.ingredients.map((ingredient) => (
                  <li key={ingredient.id}>
                    <label className="flex cursor-pointer items-center gap-3 px-4 py-3 text-lg">
                      <input
                        type="checkbox"
                        className="size-5 accent-primary"
                        checked={checked.has(ingredient.id)}
                        onChange={() =>
                          setChecked((all) => {
                            const next = new Set(all);
                            if (next.has(ingredient.id)) next.delete(ingredient.id);
                            else next.add(ingredient.id);
                            return next;
                          })
                        }
                      />
                      <span className={cx("flex-1", checked.has(ingredient.id) && "text-muted line-through")}>
                        {ingredient.label}
                      </span>
                      <span className="font-medium tabular-nums">{amountText(ingredient)}</span>
                    </label>
                  </li>
                ))}
              </ul>
            </>
          ) : step ? (
            <>
              <p className="text-sm font-medium text-primary" data-testid="prep-step-count">
                {t("stepOf", { current: index + 1, total: last })}
              </p>
              <p
                className="font-display text-3xl leading-snug text-balance sm:text-4xl"
                data-testid="prep-step"
              >
                {stepText(step.action)}
              </p>
              {step.temperatureC || step.equipment.length > 0 ? (
                <div className="flex flex-wrap gap-2 text-sm">
                  {step.temperatureC ? (
                    <span className="rounded-full bg-raised px-3 py-1">{step.temperatureC} °C</span>
                  ) : null}
                  {step.equipment.map((item) => (
                    <span key={item} className="rounded-full bg-raised px-3 py-1">
                      {item}
                    </span>
                  ))}
                </div>
              ) : null}
              {stepIngredients.length > 0 ? (
                <section className="flex flex-col gap-2">
                  <h2 className="text-sm font-medium text-muted">{t("forStep")}</h2>
                  <ul className="flex flex-col gap-1 text-lg">
                    {stepIngredients.map((ingredient) => (
                      <li key={ingredient.id} className="flex justify-between gap-3">
                        <span>{ingredient.label}</span>
                        <span className="font-medium tabular-nums">{amountText(ingredient)}</span>
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}
              {step.durationS ? (
                <TimerControl
                  timer={timerOf(index)}
                  totalS={step.durationS}
                  now={now}
                  labels={{
                    start: t("timerStart", { duration: clock(step.durationS) }),
                    pause: t("pause"),
                    resume: t("resume"),
                    reset: t("reset"),
                    done: t("timerDone"),
                  }}
                  onStart={() => startTimer(index, step.durationS!)}
                  onPause={() => pauseTimer(index)}
                  onReset={() => resetTimer(index)}
                />
              ) : null}
              {step.expectedResult ? (
                <p className="rounded-lg bg-soft px-4 py-3 text-soft-foreground">
                  {tr("expected")} : {step.expectedResult}
                </p>
              ) : null}
            </>
          ) : (
            <>
              <h1 className="font-display text-4xl">{t("platingTitle")}</h1>
              {recipe.plating ? (
                <p className="text-xl leading-relaxed">{platingText(recipe.plating)}</p>
              ) : null}
              <p className="text-muted">{t("done")}</p>
            </>
          )}
        </div>
      </main>

      <footer className="flex items-center justify-between gap-3 border-t border-border px-4 py-3 sm:px-8">
        <Button variant="secondary" size="lg" disabled={index === -1} onClick={() => go(index - 1)}>
          {t("previous")}
        </Button>
        <p className="hidden text-xs text-muted sm:block">{t("keepAwake")}</p>
        {index < last ? (
          <Button size="lg" onClick={() => go(index + 1)}>
            {index === -1 ? t("start") : t("next")}
          </Button>
        ) : (
          <Button size="lg" onClick={() => router.push(exitHref)}>
            {t("finish")}
          </Button>
        )}
      </footer>
    </div>
  );
}

function TimerControl({
  timer,
  totalS,
  now,
  labels,
  onStart,
  onPause,
  onReset,
}: {
  timer: Timer | undefined;
  totalS: number;
  now: number;
  labels: { start: string; pause: string; resume: string; reset: string; done: string };
  onStart: () => void;
  onPause: () => void;
  onReset: () => void;
}) {
  const running = timer?.endsAt !== null && timer?.endsAt !== undefined;
  const remaining = timer ? remainingOf(timer, now) : totalS;
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-surface px-4 py-3">
      <span className="font-display text-4xl tabular-nums" data-testid="timer">
        {timer?.done ? labels.done : clock(remaining)}
      </span>
      {!timer ? (
        <Button onClick={onStart}>{labels.start}</Button>
      ) : timer.done ? (
        <Button variant="secondary" onClick={onReset}>
          {labels.reset}
        </Button>
      ) : (
        <>
          {running ? (
            <Button variant="secondary" onClick={onPause}>
              {labels.pause}
            </Button>
          ) : (
            <Button onClick={onStart}>{labels.resume}</Button>
          )}
          <Button variant="ghost" onClick={onReset}>
            {labels.reset}
          </Button>
        </>
      )}
    </div>
  );
}
