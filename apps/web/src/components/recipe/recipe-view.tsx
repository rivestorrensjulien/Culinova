"use client";

import { SERVINGS_PRESETS } from "@culinova/core";
import { Badge, Button, Card, CardBody, cx } from "@culinova/ui";
import { useFormatter, useTranslations } from "next-intl";
import { type ReactNode, useState } from "react";
import type { RecipeView as RecipeData } from "@/server/generation/view";
import { formatDuration, scaledDisplay, scaledKitchenMeasure } from "./format";

const DIMENSIONS = { mass: "mass", volume: "volume", count: "count" } as const;

export function RecipeView({ recipe, actions }: { recipe: RecipeData; actions?: ReactNode }) {
  const t = useTranslations("Recipe");
  const format = useFormatter();
  const [servings, setServings] = useState(recipe.servings);
  const total = recipe.prepS + recipe.cookS + recipe.restS;
  const labels = new Map(recipe.ingredients.map((i) => [i.id, i.label]));
  const groups = [...new Set(recipe.ingredients.map((i) => i.group ?? ""))];

  const quantityText = (ingredient: RecipeData["ingredients"][number]) => {
    const display = scaledDisplay(
      { dimension: DIMENSIONS[ingredient.dimension], value: ingredient.quantity },
      recipe.servings,
      servings,
    );
    const unit = t(`units.${display.unit}`);
    const main = `${format.number(display.value, { maximumFractionDigits: 2 })}${unit ? ` ${unit}` : ""}`;
    if (ingredient.displayQuantity !== null && ingredient.displayUnit) {
      const kitchen = scaledKitchenMeasure(ingredient.displayQuantity, recipe.servings, servings);
      return `${main} (${format.number(kitchen)} ${ingredient.displayUnit})`;
    }
    return main;
  };

  return (
    <article className="flex flex-col gap-8" data-testid="recipe-view">
      <header className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          {recipe.cuisineLabel ? <Badge tone="accent">{recipe.cuisineLabel}</Badge> : null}
          {recipe.fusionLabel ? <Badge tone="sage">{recipe.fusionLabel}</Badge> : null}
          {recipe.difficulty ? <Badge>{t(`difficulty.${recipe.difficulty}`)}</Badge> : null}
          {recipe.versionCount > 1 ? <Badge>{t("version", { number: recipe.versionNo })}</Badge> : null}
        </div>
        <h2 className="font-display text-4xl leading-tight text-balance" data-testid="recipe-name">
          {recipe.name}
        </h2>
        {recipe.description ? <p className="max-w-3xl text-lg text-muted">{recipe.description}</p> : null}
        <dl className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
          {[
            [t("prep"), recipe.prepS],
            [t("cook"), recipe.cookS],
            [t("rest"), recipe.restS],
            [t("total"), total],
          ]
            .filter(([, value]) => Number(value) > 0)
            .map(([label, value]) => (
              <div key={String(label)} className="flex gap-1.5">
                <dt className="text-muted">{label}</dt>
                <dd className="font-medium">{formatDuration(Number(value))}</dd>
              </div>
            ))}
        </dl>
      </header>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)]">
        <div className="flex flex-col gap-6">
          <div
            className="flex aspect-[4/5] items-center justify-center rounded-lg border border-dashed border-border-strong bg-raised p-6 text-center text-sm text-muted"
            role="img"
            aria-label={t("photo")}
          >
            {actions ? null : t("photo")}
          </div>
          {actions}

          <Card>
            <CardBody className="flex flex-col gap-4">
              <div className="flex items-center justify-between gap-3">
                <h3 className="font-display text-2xl">{t("miseEnPlace")}</h3>
                <div className="flex items-center gap-1" role="group" aria-label={t("servingsLabel")}>
                  <Button
                    size="sm"
                    variant="secondary"
                    aria-label={t("less")}
                    disabled={servings <= 1}
                    onClick={() => setServings((n) => Math.max(1, n - 1))}
                  >
                    −
                  </Button>
                  <span className="min-w-24 text-center text-sm font-medium" data-testid="servings">
                    {t("servings", { count: servings })}
                  </span>
                  <Button
                    size="sm"
                    variant="secondary"
                    aria-label={t("more")}
                    disabled={servings >= 200}
                    onClick={() => setServings((n) => Math.min(200, n + 1))}
                  >
                    +
                  </Button>
                </div>
              </div>
              <div className="flex flex-wrap gap-1">
                {SERVINGS_PRESETS.map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setServings(n)}
                    className={cx(
                      "cursor-pointer rounded-full border px-2.5 py-0.5 text-xs",
                      n === servings
                        ? "border-foreground bg-foreground text-background"
                        : "border-border text-muted hover:text-foreground",
                    )}
                  >
                    {n}
                  </button>
                ))}
              </div>
              {groups.map((group) => (
                <div key={group || "_"} className="flex flex-col gap-1">
                  {group ? (
                    <h4 className="text-xs font-medium tracking-wide text-muted uppercase">{group}</h4>
                  ) : null}
                  <ul className="divide-y divide-border">
                    {recipe.ingredients
                      .filter((i) => (i.group ?? "") === group)
                      .map((ingredient) => (
                        <li
                          key={ingredient.id}
                          className="flex items-baseline justify-between gap-3 py-1.5 text-sm"
                          data-testid="ingredient"
                        >
                          <span>
                            {ingredient.label}
                            {ingredient.preparation ? (
                              <span className="text-muted">, {ingredient.preparation}</span>
                            ) : null}
                            {ingredient.optional ? (
                              <span className="text-muted"> ({t("optional")})</span>
                            ) : null}
                            {ingredient.toConfirm ? (
                              <Badge tone="warning" className="ml-2" title={t("toConfirmHint")}>
                                {t("toConfirm")}
                              </Badge>
                            ) : null}
                          </span>
                          <span className="shrink-0 text-right font-medium tabular-nums">
                            {quantityText(ingredient)}
                          </span>
                        </li>
                      ))}
                  </ul>
                </div>
              ))}
            </CardBody>
          </Card>

          <Card>
            <CardBody className="flex flex-col gap-1 text-sm">
              <h3 className="font-display text-xl">{t("cost")}</h3>
              <p className="text-muted">{t("costSoon")}</p>
            </CardBody>
          </Card>
        </div>

        <div className="flex flex-col gap-6">
          <section className="flex flex-col gap-4">
            <h3 className="font-display text-2xl">{t("stepsTitle")}</h3>
            <ol className="flex flex-col gap-4">
              {recipe.steps.map((step, index) => (
                <li key={step.id} className="flex gap-4" data-testid="step">
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-soft font-display text-soft-foreground">
                    {index + 1}
                  </span>
                  <div className="flex flex-col gap-1.5">
                    <span className="text-xs font-medium tracking-wide text-muted uppercase">
                      {t(`phases.${step.phase}`)}
                    </span>
                    <p>{step.action}</p>
                    <div className="flex flex-wrap gap-1.5">
                      {step.temperatureC !== null ? <Badge>{step.temperatureC} °C</Badge> : null}
                      {step.durationS ? (
                        <Badge tone={step.timer ? "accent" : "neutral"}>
                          {step.timer ? `⏱ ${t("timer")} · ` : ""}
                          {formatDuration(step.durationS)}
                        </Badge>
                      ) : null}
                      {step.equipment.map((item) => (
                        <Badge key={item}>{item}</Badge>
                      ))}
                      {step.ingredientIds.map((id) =>
                        labels.has(id) ? (
                          <Badge key={id} tone="sage">
                            {labels.get(id)}
                          </Badge>
                        ) : null,
                      )}
                    </div>
                    {step.expectedResult ? (
                      <p className="text-sm text-muted">
                        {t("expected")} : {step.expectedResult}
                      </p>
                    ) : null}
                  </div>
                </li>
              ))}
            </ol>
          </section>

          {recipe.plating ? (
            <Card>
              <CardBody className="flex flex-col gap-3">
                <h3 className="font-display text-2xl">{t("plating")}</h3>
                <dl className="grid gap-2 text-sm sm:grid-cols-[auto_1fr] sm:gap-x-6">
                  {(Object.keys(recipe.plating) as Array<keyof NonNullable<RecipeData["plating"]>>)
                    .filter((key) => recipe.plating?.[key])
                    .map((key) => (
                      <div key={key} className="contents">
                        <dt className="text-muted">{t(`platingFields.${key}`)}</dt>
                        <dd>{recipe.plating?.[key]}</dd>
                      </div>
                    ))}
                </dl>
              </CardBody>
            </Card>
          ) : null}

          <div className="grid gap-4 sm:grid-cols-2">
            {recipe.equipment.length ? (
              <div>
                <h4 className="mb-1 text-sm font-medium">{t("equipment")}</h4>
                <p className="text-sm text-muted">{recipe.equipment.join(" · ")}</p>
              </div>
            ) : null}
            {recipe.allergens.length ? (
              <div>
                <h4 className="mb-1 text-sm font-medium">{t("allergens")}</h4>
                <div className="flex flex-wrap gap-1">
                  {recipe.allergens.map((a) => (
                    <Badge key={a} tone="warning">
                      {t.has(`allergenNames.${a}`) ? t(`allergenNames.${a}`) : a}
                    </Badge>
                  ))}
                </div>
              </div>
            ) : null}
            {recipe.diets.length ? (
              <div>
                <h4 className="mb-1 text-sm font-medium">{t("diets")}</h4>
                <div className="flex flex-wrap gap-1">
                  {recipe.diets.map((d) => (
                    <Badge key={d} tone="sage">
                      {t.has(`dietNames.${d}`) ? t(`dietNames.${d}`) : d}
                    </Badge>
                  ))}
                </div>
              </div>
            ) : null}
            {recipe.tips.length ? (
              <div className="sm:col-span-2">
                <h4 className="mb-1 text-sm font-medium">{t("tips")}</h4>
                <ul className="list-disc pl-5 text-sm text-muted">
                  {recipe.tips.map((tip) => (
                    <li key={tip}>{tip}</li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </article>
  );
}
