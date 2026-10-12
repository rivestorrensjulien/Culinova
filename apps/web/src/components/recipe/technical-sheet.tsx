"use client";

import { pricingSheet } from "@culinova/core";
import { Button, cx } from "@culinova/ui";
import { useFormatter, useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import { Link } from "@/i18n/navigation";
import type { RecipeView as RecipeData } from "@/server/generation/view";
import { formatDuration, platingText } from "./format";
import { useRecipeText } from "./use-recipe-text";

const NUTRIENTS = [
  { key: "kcal", unit: "kcal" },
  { key: "fat", unit: "g" },
  { key: "saturated", unit: "g" },
  { key: "carbs", unit: "g" },
  { key: "sugars", unit: "g" },
  { key: "protein", unit: "g" },
  { key: "salt", unit: "g" },
] as const;

/**
 * Fiche technique d'une recette, mise en page pour l'impression : le navigateur
 * l'imprime ou l'enregistre en PDF (A4). Quantités et coûts recalculés au nombre de portions.
 */
export function TechnicalSheet({ recipe, photoId }: { recipe: RecipeData; photoId: string | null }) {
  const t = useTranslations("Sheet");
  const tr = useTranslations("Recipe");
  const tn = useTranslations("Nutrition");
  const format = useFormatter();
  const [portions, setPortions] = useState(recipe.servings);
  const { amountText, stepText } = useRecipeText(recipe, recipe.servings, portions);
  const ratio = portions / recipe.servings;
  const euros = (cents: number) => format.number(cents / 100, { style: "currency", currency: "EUR" });
  const unitLabel = { kg: "€/kg", l: "€/l", piece: "€/pièce" } as const;
  const total = recipe.prepS + recipe.cookS + recipe.restS;

  const { settings, appliances, pricing } = recipe.pricing;
  const sheet = useMemo(
    () =>
      recipe.cost.pricedCount === 0
        ? null
        : pricingSheet({
            materialCents: recipe.cost.totalCents,
            servings: Math.max(1, Math.round(recipe.servings)),
            laborSeconds: pricing?.laborSeconds ?? recipe.prepS,
            hourlyRateCents: settings.hourlyRateCents,
            energy: (pricing?.energyUses ?? []).flatMap((use) => {
              const appliance = appliances.find((a) => a.id === use.applianceId);
              return appliance ? [{ powerW: appliance.powerW, seconds: use.seconds }] : [];
            }),
            kwhPriceCents: settings.kwhPriceCents,
            coefficient: pricing?.coefficient ?? settings.coefficient,
            vatRate: pricing?.vatRate ?? settings.vatRate,
            sellingPriceTtcCents: pricing?.sellingPriceTtcCents ?? null,
          }),
    [recipe, settings, appliances, pricing],
  );
  const coefficient = pricing?.coefficient ?? settings.coefficient;
  const vatRate = pricing?.vatRate ?? settings.vatRate;
  const hasEstimates = recipe.ingredients.some((i) => recipe.cost.lines[i.id]?.estimated);
  const nutritionShown = recipe.nutrition.counted > 0;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Link href={`/app/recettes/${recipe.recipeId}`} className="text-sm text-primary hover:underline">
          ← {t("back")}
        </Link>
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-sm">
            {t("portions")}
            <input
              type="number"
              min={1}
              max={500}
              value={portions}
              onChange={(e) =>
                setPortions(Math.min(500, Math.max(1, Math.round(Number(e.target.value) || 1))))
              }
              className="w-20 rounded-md border border-border-strong bg-surface px-2 py-1 text-right"
            />
          </label>
          <Button onClick={() => window.print()}>{t("print")}</Button>
        </div>
      </div>
      <p className="text-sm text-muted print:hidden">{t("printHint")}</p>

      <article
        className="mx-auto flex w-full max-w-[210mm] flex-col gap-5 rounded-lg border border-border bg-surface p-8 text-sm print:max-w-none print:border-0 print:p-0 print:text-[10.5pt]"
        data-testid="technical-sheet"
      >
        <header className="flex items-start justify-between gap-6 border-b border-border pb-4">
          <div className="flex flex-col gap-1">
            <p className="text-xs tracking-wide text-muted uppercase">{t("title")}</p>
            <h1 className="font-display text-3xl leading-tight">{recipe.name}</h1>
            {recipe.description ? <p className="text-muted">{recipe.description}</p> : null}
            <p className="text-xs text-muted">
              {[recipe.cuisineLabel, recipe.difficulty ? tr(`difficulty.${recipe.difficulty}`) : null]
                .filter(Boolean)
                .join(" · ")}
            </p>
          </div>
          {photoId ? (
            // Image servie par l'application à sa propriétaire : balise simple pour l'impression.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={`/api/images/${photoId}`}
              alt=""
              className="size-32 shrink-0 rounded-md object-cover print:size-28"
            />
          ) : null}
        </header>

        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          {[
            [t("portionsShort"), String(portions)],
            [tr("prep"), recipe.prepS > 0 ? formatDuration(recipe.prepS) : "—"],
            [tr("cook"), recipe.cookS > 0 ? formatDuration(recipe.cookS) : "—"],
            [tr("rest"), recipe.restS > 0 ? formatDuration(recipe.restS) : "—"],
            [tr("total"), total > 0 ? formatDuration(total) : "—"],
          ].map(([label, value]) => (
            <div
              key={label}
              className="rounded-md bg-raised px-3 py-2 print:border print:border-border print:bg-transparent"
            >
              <dt className="text-xs text-muted">{label}</dt>
              <dd className="font-medium">{value}</dd>
            </div>
          ))}
        </dl>

        <section className="flex flex-col gap-2 break-inside-avoid">
          <h2 className="font-display text-xl">{t("ingredientsTitle")}</h2>
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b border-border-strong text-left text-xs text-muted">
                <th className="py-1.5 pr-2 font-medium">{t("ingredient")}</th>
                <th className="py-1.5 pr-2 text-right font-medium">{t("quantity")}</th>
                <th className="py-1.5 pr-2 text-right font-medium">{t("unitPrice")}</th>
                <th className="py-1.5 text-right font-medium">{t("lineCost")}</th>
              </tr>
            </thead>
            <tbody>
              {recipe.ingredients.map((ingredient) => {
                const line = recipe.cost.lines[ingredient.id];
                return (
                  <tr key={ingredient.id} className="border-b border-border" data-testid="sheet-line">
                    <td className="py-1.5 pr-2">
                      {ingredient.label}
                      {ingredient.base ? <span className="text-muted"> ({t("homemade")})</span> : null}
                      {ingredient.optional ? <span className="text-muted"> ({tr("optional")})</span> : null}
                    </td>
                    <td className="py-1.5 pr-2 text-right tabular-nums">{amountText(ingredient)}</td>
                    <td className="py-1.5 pr-2 text-right text-muted tabular-nums">
                      {line?.price && line.unit
                        ? `${format.number(Number(line.price), { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${unitLabel[line.unit]}${line.estimated ? " *" : ""}`
                        : "—"}
                    </td>
                    <td className="py-1.5 text-right tabular-nums">
                      {line ? euros(Math.round(line.cents * ratio)) : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="font-medium">
                <td className="pt-2" colSpan={3}>
                  {t("totalMaterial", { count: portions })}
                </td>
                <td className="pt-2 text-right tabular-nums" data-testid="sheet-total">
                  {euros(Math.round(recipe.cost.totalCents * ratio))}
                </td>
              </tr>
              <tr className="text-muted">
                <td colSpan={3}>{t("perPortion")}</td>
                <td className="text-right tabular-nums">{euros(recipe.cost.perPortionCents)}</td>
              </tr>
            </tfoot>
          </table>
          {hasEstimates ? <p className="text-xs text-muted">{t("estimatedMark")}</p> : null}
          {recipe.cost.missing.length > 0 ? (
            <p className="text-xs text-muted">
              {t("missing", { list: recipe.cost.missing.map((m) => m.label).join(", ") })}
            </p>
          ) : null}
        </section>

        {sheet ? (
          <section className="flex flex-col gap-2 break-inside-avoid">
            <h2 className="font-display text-xl">{t("pricingTitle")}</h2>
            <dl className="grid grid-cols-2 gap-x-6 gap-y-1 sm:grid-cols-3">
              {[
                [t("fullCost"), euros(sheet.perPortion.totalCents)],
                [t("coefficient"), format.number(coefficient)],
                [t("vat"), `${format.number(vatRate)} %`],
                [t("suggestedTtc"), euros(sheet.suggested.priceInclTaxCents)],
                ...(sheet.actual
                  ? [
                      [t("sellingTtc"), euros(sheet.actual.priceInclTaxCents)],
                      [
                        t("foodCost"),
                        sheet.actual.foodCostRatio === null
                          ? "—"
                          : format.number(sheet.actual.foodCostRatio, {
                              style: "percent",
                              maximumFractionDigits: 1,
                            }),
                      ],
                    ]
                  : []),
              ].map(([label, value]) => (
                <div key={label} className="flex justify-between gap-3 border-b border-border py-1">
                  <dt className="text-muted">{label}</dt>
                  <dd className="font-medium tabular-nums">{value}</dd>
                </div>
              ))}
            </dl>
          </section>
        ) : null}

        <section className="flex flex-col gap-2">
          <h2 className="font-display text-xl">{t("stepsTitle")}</h2>
          <ol className="flex flex-col gap-2">
            {recipe.steps.map((step, index) => (
              <li key={step.id} className="flex gap-3 break-inside-avoid">
                <span className="w-5 shrink-0 font-display text-base">{index + 1}.</span>
                <div className="flex flex-col gap-0.5">
                  <p>{stepText(step.action)}</p>
                  {step.temperatureC || step.durationS ? (
                    <p className="text-xs text-muted">
                      {[
                        step.temperatureC ? `${step.temperatureC} °C` : null,
                        step.durationS ? formatDuration(step.durationS) : null,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  ) : null}
                </div>
              </li>
            ))}
          </ol>
        </section>

        {recipe.plating ? (
          <section className="flex flex-col gap-1 break-inside-avoid">
            <h2 className="font-display text-xl">{t("platingTitle")}</h2>
            <p>{platingText(recipe.plating)}</p>
          </section>
        ) : null}

        <div className={cx("grid gap-4 break-inside-avoid", nutritionShown ? "sm:grid-cols-2" : "")}>
          <section className="flex flex-col gap-2">
            <h2 className="font-display text-xl">{t("allergensTitle")}</h2>
            <p>
              {recipe.allergens.length > 0
                ? recipe.allergens
                    .map((a) => (tr.has(`allergenNames.${a}`) ? tr(`allergenNames.${a}`) : a))
                    .join(", ")
                : t("noAllergen")}
            </p>
            {recipe.equipment.length > 0 ? (
              <>
                <h2 className="mt-2 font-display text-xl">{t("equipment")}</h2>
                <p>{recipe.equipment.join(" · ")}</p>
              </>
            ) : null}
          </section>
          {nutritionShown ? (
            <section className="flex flex-col gap-2">
              <h2 className="font-display text-xl">{t("nutritionTitle")}</h2>
              <dl className="flex flex-col">
                {NUTRIENTS.map(({ key, unit }) => (
                  <div key={key} className="flex justify-between gap-3 border-b border-border py-0.5">
                    <dt className="text-muted">{tn(`nutrients.${key}`)}</dt>
                    <dd className="tabular-nums">
                      {format.number(recipe.nutrition.perPortion[key], { maximumFractionDigits: 1 })} {unit}
                    </dd>
                  </div>
                ))}
              </dl>
            </section>
          ) : null}
        </div>

        <footer className="border-t border-border pt-3 text-xs text-muted">
          {t("footer", {
            version: recipe.versionNo,
            date: format.dateTime(new Date(), { dateStyle: "long" }),
          })}
        </footer>
      </article>
    </div>
  );
}
