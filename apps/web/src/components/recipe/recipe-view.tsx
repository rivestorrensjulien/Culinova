"use client";

import { leadTime, SERVINGS_PRESETS, splitStepText } from "@culinova/core";
import { Badge, Button, Card, CardBody, cx, Spinner } from "@culinova/ui";
import { useFormatter, useTranslations } from "next-intl";
import { type ReactNode, useState } from "react";
import { Link } from "@/i18n/navigation";
import type { RecipeView as RecipeData } from "@/server/generation/view";
import { formatDuration, ingredientAmount, platingText } from "./format";

export function RecipeView({
  recipe,
  actions,
  onMakeHomemade,
  pendingLineIds,
  initialTargetG,
  photo,
}: {
  recipe: RecipeData;
  actions?: ReactNode;
  /** « Faire maison » : absent, le bouton n'est pas proposé (aperçu, ancienne version). */
  onMakeHomemade?: (lineId: string) => void;
  /** Lignes dont la recette maison est en cours de rédaction. */
  pendingLineIds?: ReadonlySet<string>;
  /** Base : quantité à préparer demandée par la recette principale, en grammes. */
  initialTargetG?: number;
  /** Photo de la recette (au-dessus des ingrédients). */
  photo?: ReactNode;
}) {
  const t = useTranslations("Recipe");
  const format = useFormatter();
  const [servings, setServings] = useState(recipe.servings);
  // Une base se dimensionne au poids (400 g de pains bao), un plat au nombre de personnes.
  const baseInfo = recipe.kind === "base" ? recipe.baseInfo : null;
  const baseYield = baseInfo?.yieldG ?? 1;
  const pieceG =
    baseInfo?.yieldDisplayQuantity && baseInfo.yieldDisplayQuantity > 0
      ? baseYield / baseInfo.yieldDisplayQuantity
      : null;
  const stepG = pieceG ?? Math.max(10, Math.round(baseYield / 40) * 10);
  const [targetG, setTargetG] = useState(
    initialTargetG && initialTargetG > 0 ? Math.round(initialTargetG) : baseYield,
  );
  const scaleFrom = baseInfo ? baseYield : recipe.servings;
  const scaleTo = baseInfo ? targetG : servings;
  const homemade = recipe.ingredients.filter((i) => i.base);
  const total = recipe.prepS + recipe.cookS + recipe.restS;
  const byId = new Map(recipe.ingredients.map((i) => [i.id, i]));
  const euros = (cents: number) =>
    format.number(Math.round(cents) / 100, { style: "currency", currency: "EUR" });

  /** Quantité d'un ingrédient (ou d'une partie) : grammes, puis mesure parlante entre parenthèses. */
  const amountText = (ingredient: RecipeData["ingredients"][number], part: number | null = null) => {
    const amount = ingredientAmount(ingredient, part, scaleFrom, scaleTo);
    const unit = t(`units.${amount.unit}`);
    const main = `${format.number(amount.value, { maximumFractionDigits: 2 })}${unit ? ` ${unit}` : ""}`;
    return amount.kitchen ? `${main} (${format.number(amount.kitchen.value)} ${amount.kitchen.unit})` : main;
  };

  /**
   * Quantité citée dans une étape, recalculée au nombre de personnes affiché, entre
   * parenthèses après le nom de l'ingrédient : « les carottes (100 g) », « le sel (5 g, 1 c. à café) ».
   * Les recettes plus anciennes écrivaient « {{i3}} de mascarpone » : le poids reste alors sans parenthèses.
   */
  const stepQuantityText = (id: string, part: number | null, nextText: string) => {
    const ingredient = byId.get(id);
    if (!ingredient) return "";
    if (/^\s+(de|d['’])/i.test(nextText)) return amountText(ingredient, part);
    const amount = ingredientAmount(ingredient, part, scaleFrom, scaleTo);
    const unit = t(`units.${amount.unit}`);
    const main = `${format.number(amount.value, { maximumFractionDigits: 2 })}${unit ? ` ${unit}` : ""}`;
    return amount.kitchen
      ? `(${main}, ${format.number(amount.kitchen.value)} ${amount.kitchen.unit})`
      : `(${main})`;
  };

  /** Poids d'un ingrédient pesé, recalculé (sert à dimensionner sa base maison). */
  const scaledGrams = (ingredient: RecipeData["ingredients"][number]) =>
    ingredient.dimension === "mass" ? Math.round((ingredient.quantity * scaleTo) / scaleFrom) : null;
  const baseHref = (ingredient: RecipeData["ingredients"][number]) => {
    const grams = scaledGrams(ingredient);
    return `/app/recettes/${ingredient.base!.recipeId}${grams ? `?quantite=${grams}` : ""}`;
  };
  const piecesText = (grams: number) =>
    pieceG && baseInfo?.yieldDisplayUnit
      ? ` (${format.number(Math.round((grams / pieceG) * 2) / 2)} ${baseInfo.yieldDisplayUnit})`
      : "";

  return (
    <article className="flex flex-col gap-8" data-testid="recipe-view">
      <header className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          {recipe.cuisineLabel ? <Badge tone="accent">{recipe.cuisineLabel}</Badge> : null}
          {recipe.fusionLabel ? <Badge tone="sage">{recipe.fusionLabel}</Badge> : null}
          {recipe.difficulty ? <Badge>{t(`difficulty.${recipe.difficulty}`)}</Badge> : null}
          {recipe.versionCount > 1 ? <Badge>{t("version", { number: recipe.versionNo })}</Badge> : null}
          {baseInfo ? <Badge tone="sage">{t("baseBadge")}</Badge> : null}
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
        {baseInfo ? (
          <div className="flex flex-col gap-1 text-sm" data-testid="base-info">
            <p>
              <span className="text-muted">{t("baseYield")} </span>
              <span className="font-medium">
                {format.number(baseYield)} g{piecesText(baseYield)}
              </span>
              {baseInfo.shelfLifeH ? (
                <span className="text-muted">
                  {" · "}
                  {baseInfo.shelfLifeH >= 48
                    ? t("baseShelfLifeDays", { days: Math.round(baseInfo.shelfLifeH / 24) })
                    : t("baseShelfLife", { hours: baseInfo.shelfLifeH })}
                </span>
              ) : null}
            </p>
            {baseInfo.usedIn.length > 0 ? (
              <p>
                <span className="text-muted">{t("baseUsedIn")} </span>
                {baseInfo.usedIn.map((use, index) => (
                  <span key={use.recipeId}>
                    {index > 0 ? ", " : null}
                    <Link href={`/app/recettes/${use.recipeId}`} className="text-primary hover:underline">
                      {use.name}
                    </Link>
                  </span>
                ))}
              </p>
            ) : null}
          </div>
        ) : null}
      </header>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)]">
        <div className="flex flex-col gap-6">
          {photo}
          <Card>
            <CardBody className="flex flex-col gap-4">
              <div className="flex items-center justify-between gap-3">
                <h3 className="font-display text-2xl">{t("ingredientsTitle")}</h3>
                {baseInfo ? (
                  <div className="flex items-center gap-1" role="group" aria-label={t("baseQuantityLabel")}>
                    <Button
                      size="sm"
                      variant="secondary"
                      aria-label={t("less")}
                      disabled={targetG <= stepG}
                      onClick={() => setTargetG((g) => Math.max(stepG, Math.round(g - stepG)))}
                    >
                      −
                    </Button>
                    <span className="min-w-28 text-center text-sm font-medium" data-testid="base-quantity">
                      {format.number(targetG)} g{piecesText(targetG)}
                    </span>
                    <Button
                      size="sm"
                      variant="secondary"
                      aria-label={t("more")}
                      disabled={targetG >= baseYield * 50}
                      onClick={() => setTargetG((g) => Math.round(g + stepG))}
                    >
                      +
                    </Button>
                  </div>
                ) : (
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
                )}
              </div>
              {baseInfo ? null : (
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
              )}
              <ul className="divide-y divide-border">
                {recipe.ingredients.map((ingredient) => (
                  <li
                    key={ingredient.id}
                    className="flex items-baseline justify-between gap-3 py-1.5 text-sm"
                    data-testid="ingredient"
                  >
                    <span className="flex flex-col gap-0.5">
                      <span>
                        {ingredient.label}
                        {ingredient.optional ? <span className="text-muted"> ({t("optional")})</span> : null}
                      </span>
                      {ingredient.base ? (
                        <span className="text-xs text-muted" data-testid="homemade">
                          {t("homemade")} ·{" "}
                          <Link href={baseHref(ingredient)} className="text-primary hover:underline">
                            {t("homemadeOpen")}
                          </Link>
                        </span>
                      ) : ingredient.pendingBaseGenerationId || pendingLineIds?.has(ingredient.id) ? (
                        <span className="flex items-center gap-1.5 text-xs text-muted">
                          <Spinner /> {t("homemadePending")}
                        </span>
                      ) : ingredient.storeBought && !baseInfo ? (
                        <span className="flex flex-wrap items-center gap-2 text-xs text-muted">
                          {t("storeBought")}
                          {onMakeHomemade && ingredient.dimension === "mass" ? (
                            <button
                              type="button"
                              className="cursor-pointer font-medium text-primary hover:underline"
                              onClick={() => onMakeHomemade(ingredient.id)}
                            >
                              {t("makeHomemade")}
                            </button>
                          ) : null}
                        </span>
                      ) : null}
                    </span>
                    <span className="shrink-0 text-right font-medium tabular-nums">
                      {amountText(ingredient)}
                    </span>
                  </li>
                ))}
              </ul>
            </CardBody>
          </Card>

          {actions}

          <Card data-testid="cost">
            <CardBody className="flex flex-col gap-3 text-sm">
              <h3 className="font-display text-xl">{t("cost")}</h3>
              {recipe.cost.pricedCount === 0 ? (
                <p className="text-muted">{t("costEmpty")}</p>
              ) : baseInfo ? (
                <dl className="grid grid-cols-2 gap-3">
                  <div>
                    <dt className="text-muted">{t("costBase", { grams: format.number(targetG) })}</dt>
                    <dd className="font-display text-2xl" data-testid="cost-total">
                      {euros((recipe.cost.totalCents * targetG) / baseYield)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted">{t("costPerKg")}</dt>
                    <dd className="font-display text-2xl" data-testid="cost-kg">
                      {euros((recipe.cost.totalCents * 1000) / baseYield)}
                    </dd>
                  </div>
                </dl>
              ) : (
                <dl className="grid grid-cols-2 gap-3">
                  <div>
                    <dt className="text-muted">{t("costTotal", { count: servings })}</dt>
                    <dd className="font-display text-2xl" data-testid="cost-total">
                      {euros((recipe.cost.totalCents * servings) / recipe.servings)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted">{t("costPerPortion")}</dt>
                    <dd className="font-display text-2xl" data-testid="cost-portion">
                      {euros(recipe.cost.perPortionCents)}
                    </dd>
                  </div>
                </dl>
              )}
              {recipe.cost.missing.length > 0 ? (
                <div className="flex flex-col gap-1">
                  <p className="text-muted">
                    {t("costMissing", {
                      count: recipe.cost.missing.length,
                      total: recipe.cost.lineCount,
                    })}{" "}
                    {recipe.cost.missing.map((m) => m.label).join(", ")}.
                  </p>
                  <Link
                    href={`/app/ingredients?recette=${recipe.recipeId}`}
                    className="font-medium text-primary hover:underline"
                  >
                    {t("costFillPrices")}
                  </Link>
                </div>
              ) : null}
            </CardBody>
          </Card>
        </div>

        <div className="flex flex-col gap-6">
          {homemade.length > 0 ? (
            <Card className="border-accent/40" data-testid="upstream">
              <CardBody className="flex flex-col gap-3">
                <h3 className="font-display text-2xl">{t("upstreamTitle")}</h3>
                <ul className="flex flex-col gap-3 text-sm">
                  {homemade.map((ingredient) => {
                    const base = ingredient.base!;
                    const lead = leadTime(base, recipe);
                    return (
                      <li key={ingredient.id} className="flex flex-col gap-0.5">
                        <span className="font-medium">
                          {base.name} · {amountText(ingredient)}
                        </span>
                        <span>
                          {t("upstreamStart", { duration: formatDuration(lead.startBeforeServiceS) })}
                        </span>
                        <span className="text-muted">
                          {t("upstreamDetail", {
                            base: formatDuration(lead.baseTotalS),
                            recipe: formatDuration(lead.recipeTotalS),
                          })}
                        </span>
                        <Link
                          href={baseHref(ingredient)}
                          className="font-medium text-primary hover:underline"
                        >
                          {t("homemadeOpen")}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </CardBody>
            </Card>
          ) : null}
          <section className="flex flex-col gap-4">
            <h3 className="font-display text-2xl">{t("stepsTitle")}</h3>
            <ol className="flex flex-col gap-4">
              {recipe.steps.map((step, index) => (
                <li key={step.id} className="flex gap-4" data-testid="step">
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-soft font-display text-soft-foreground">
                    {index + 1}
                  </span>
                  <div className="flex flex-col gap-1.5 pt-1">
                    <p>
                      {splitStepText(step.action).map((segment, i, all) => {
                        if (segment.kind === "text") return segment.text;
                        const next = all[i + 1];
                        return (
                          <span key={i} className="font-medium">
                            {stepQuantityText(
                              segment.ref,
                              segment.part,
                              next?.kind === "text" ? next.text : "",
                            )}
                          </span>
                        );
                      })}
                    </p>
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
                <p>{platingText(recipe.plating)}</p>
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
