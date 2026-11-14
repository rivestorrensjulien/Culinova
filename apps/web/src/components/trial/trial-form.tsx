"use client";

import { Field, Notice, Select, Textarea, cx } from "@culinova/ui";
import { useTranslations } from "next-intl";
import { useActionState, useState } from "react";
import { SubmitButton } from "@/components/submit-button";
import { startTrialAction, type TrialFormState } from "@/server/actions/trial";

const MINUTES = [15, 30, 45, 60] as const;

/** Formulaire de la recette d'essai : l'essentiel de l'assistant court, sur une seule page. */
export function TrialForm({
  moments,
  query,
}: {
  moments: Array<{ code: string; label: string }>;
  /** Provenance de la visite, gardée jusqu'à la demande d'invitation. */
  query: string;
}) {
  const t = useTranslations("Trial");
  const tw = useTranslations("Wizard.home");
  const [state, action] = useActionState<TrialFormState, FormData>(startTrialAction, { status: "idle" });
  const [mode, setMode] = useState<"ingredients" | "idea">("idea");
  const error = state.status === "error" ? state.error : null;

  return (
    <form action={action} className="flex flex-col gap-6" data-testid="trial-form">
      {error ? (
        <Notice tone={error === "input" ? "warning" : "danger"} data-testid="trial-error">
          {t(`errors.${error}`)}
        </Notice>
      ) : null}
      <fieldset className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <legend className="sr-only">{t("modeLegend")}</legend>
        {(["idea", "ingredients"] as const).map((value) => (
          <label
            key={value}
            className={cx(
              "flex cursor-pointer flex-col gap-1 rounded-2xl border p-4 transition",
              mode === value
                ? "border-primary bg-primary/5 ring-1 ring-primary"
                : "border-border hover:bg-raised",
            )}
          >
            <input
              type="radio"
              name="mode"
              value={value}
              checked={mode === value}
              onChange={() => setMode(value)}
              className="sr-only"
            />
            <span className="font-medium">{tw(`modes.${value}.title`)}</span>
            <span className="text-sm text-muted">{tw(`modes.${value}.hint`)}</span>
          </label>
        ))}
      </fieldset>
      <Field label={mode === "idea" ? t("ideaLabel") : t("ingredientsLabel")}>
        {(a11y) => (
          <Textarea
            name="input"
            required
            minLength={2}
            maxLength={300}
            rows={3}
            placeholder={tw(`placeholder.${mode}`)}
            defaultValue={state.status === "error" ? state.input : ""}
            data-testid="trial-input"
            {...a11y}
          />
        )}
      </Field>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Field label={tw("moment")}>
          {(a11y) => (
            <Select
              name="moment"
              defaultValue={moments.find((m) => m.code === "main")?.code ?? moments[0]?.code}
              {...a11y}
            >
              {moments.map((m) => (
                <option key={m.code} value={m.code}>
                  {m.label}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label={t("servings")}>
          {(a11y) => (
            <Select name="servings" defaultValue="2" {...a11y}>
              {Array.from({ length: 8 }, (_, i) => i + 1).map((n) => (
                <option key={n} value={n}>
                  {t("people", { count: n })}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label={t("time")}>
          {(a11y) => (
            <Select name="minutes" defaultValue="" {...a11y}>
              <option value="">{tw("noRush")}</option>
              {MINUTES.map((m) => (
                <option key={m} value={m}>
                  {tw("minutes", { count: m })}
                </option>
              ))}
            </Select>
          )}
        </Field>
      </div>
      <input type="hidden" name="query" value={query} />
      {/* Champ piège : invisible pour les personnes, rempli par les robots. */}
      <div aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
        <label>
          Site web
          <input type="text" name="website" tabIndex={-1} autoComplete="off" defaultValue="" />
        </label>
      </div>
      <div className="flex flex-col gap-2">
        <SubmitButton size="lg" pendingLabel={t("starting")} data-testid="trial-submit">
          {t("submit")}
        </SubmitButton>
        <p className="text-xs text-muted">{t("notice")}</p>
      </div>
    </form>
  );
}
