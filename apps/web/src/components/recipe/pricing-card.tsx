"use client";

import { pricingSheet } from "@culinova/core";
import { Button, Card, CardBody, cx, Field, Input, Notice, Select, Spinner } from "@culinova/ui";
import { useFormatter, useTranslations } from "next-intl";
import { type ReactNode, useMemo, useState } from "react";
import { Link } from "@/i18n/navigation";
import { centsToInput, numberToInput, readDecimal, readEurosToCents } from "@/lib/decimal";
import { saveRecipePricingAction } from "@/server/actions/pricing";
import { VAT_RATES } from "@/server/costing/vat";
import type { RecipeView as RecipeData } from "@/server/generation/view";

/**
 * Fiche de prix d'une recette : coût de revient d'une portion, prix conseillé
 * et marges, recalculés en direct pendant la saisie. Seuls les paramètres
 * (coefficient, TVA, prix de vente, temps) sont enregistrés.
 */
export function PricingCard({
  recipe,
  estimatingPrices = false,
}: {
  recipe: RecipeData;
  /** Estimation automatique des prix manquants en cours. */
  estimatingPrices?: boolean;
}) {
  const t = useTranslations("Pricing");
  const format = useFormatter();
  const { settings, appliances, pricing } = recipe.pricing;
  const euros = (cents: number) => format.number(cents / 100, { style: "currency", currency: "EUR" });
  const percent = (ratio: number | null) =>
    ratio === null ? "—" : format.number(ratio, { style: "percent", maximumFractionDigits: 1 });

  const [coefficient, setCoefficient] = useState(numberToInput(pricing?.coefficient ?? settings.coefficient));
  const [vatRate, setVatRate] = useState(pricing?.vatRate ?? settings.vatRate);
  const [sellingTtc, setSellingTtc] = useState(centsToInput(pricing?.sellingPriceTtcCents));
  const [laborMinutes, setLaborMinutes] = useState(
    numberToInput(Math.round((pricing?.laborSeconds ?? recipe.prepS) / 60)),
  );
  const [energy, setEnergy] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      (pricing?.energyUses ?? []).map((use) => [
        use.applianceId,
        numberToInput(Math.round(use.seconds / 60)),
      ]),
    ),
  );
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ tone: "success" | "danger"; text: string } | null>(null);

  const coefficientValue = readDecimal(coefficient);
  const sellingTtcCents = sellingTtc.trim() === "" ? null : readEurosToCents(sellingTtc);
  const effectiveCoefficient =
    coefficientValue !== null && coefficientValue > 0 ? coefficientValue : settings.coefficient;
  const sheet = useMemo(() => {
    const minutes = readDecimal(laborMinutes) ?? 0;
    return pricingSheet({
      materialCents: recipe.cost.totalCents,
      servings: Math.max(1, Math.round(recipe.servings)),
      laborSeconds: Math.round(minutes * 60),
      hourlyRateCents: settings.hourlyRateCents,
      energy: appliances.map((a) => ({
        powerW: a.powerW,
        seconds: Math.round((readDecimal(energy[a.id]) ?? 0) * 60),
      })),
      kwhPriceCents: settings.kwhPriceCents,
      coefficient: effectiveCoefficient,
      vatRate,
      sellingPriceTtcCents: sellingTtcCents !== null && sellingTtcCents > 0 ? sellingTtcCents : null,
    });
  }, [
    recipe.cost.totalCents,
    recipe.servings,
    laborMinutes,
    settings,
    appliances,
    energy,
    effectiveCoefficient,
    vatRate,
    sellingTtcCents,
  ]);

  if (recipe.cost.pricedCount === 0) {
    return (
      <Card data-testid="pricing">
        <CardBody className="flex flex-col gap-2 text-sm">
          <h3 className="font-display text-xl">{t("title")}</h3>
          {estimatingPrices ? (
            <p className="flex items-center gap-2 text-muted">
              <Spinner /> {t("estimating")}
            </p>
          ) : (
            <p className="text-muted">{t("needPrices")}</p>
          )}
        </CardBody>
      </Card>
    );
  }

  const save = async () => {
    setSaving(true);
    setMessage(null);
    const result = await saveRecipePricingAction(recipe.recipeId, {
      coefficient,
      vatRate,
      sellingPriceTtc: sellingTtc,
      laborMinutes,
      energy: appliances.map((a) => ({ applianceId: a.id, minutes: energy[a.id] ?? "" })),
    }).catch(() => null);
    setSaving(false);
    if (result?.ok) setMessage({ tone: "success", text: t("saved") });
    else {
      const field = result && !result.ok ? result.field : undefined;
      setMessage({
        tone: "danger",
        text:
          field && t.has(`invalid.${field}`) ? t(`invalid.${field}` as "invalid.coefficient") : t("error"),
      });
    }
  };

  const costRows: Array<{ label: string; cents: number; note?: ReactNode }> = [
    { label: t("material"), cents: sheet.perPortion.materialCents },
    {
      label: t("labor"),
      cents: sheet.perPortion.laborCents,
      ...(settings.hourlyRateCents === null ? { note: <SettingsLink text={t("setHourlyRate")} /> } : {}),
    },
    {
      label: t("energy"),
      cents: sheet.perPortion.energyCents,
      ...(settings.kwhPriceCents === null || appliances.length === 0
        ? { note: <SettingsLink text={t(appliances.length === 0 ? "addAppliances" : "setKwhPrice")} /> }
        : {}),
    },
  ];

  const actual = sheet.actual;
  return (
    <Card data-testid="pricing">
      <CardBody className="flex flex-col gap-6 text-sm">
        <div className="flex flex-col gap-1">
          <h3 className="font-display text-2xl">{t("title")}</h3>
          <p className="text-muted">{t("subtitle", { count: recipe.servings })}</p>
        </div>

        {estimatingPrices ? (
          <p className="flex items-center gap-2 text-muted">
            <Spinner /> {t("estimating")}
          </p>
        ) : recipe.cost.missing.length > 0 ? (
          <Notice tone="warning">{t("incomplete", { count: recipe.cost.missing.length })}</Notice>
        ) : null}
        {recipe.cost.estimated.length > 0 ? (
          <Notice tone="info">
            {t("estimatedNote", { count: recipe.cost.estimated.length })}{" "}
            <Link href={`/app/ingredients?recette=${recipe.recipeId}`} className="font-medium underline">
              {t("checkPrices")}
            </Link>
          </Notice>
        ) : null}

        <div className="grid gap-6 lg:grid-cols-3">
          <section className="flex flex-col gap-2">
            <h4 className="font-medium">{t("costTitle")}</h4>
            <dl className="flex flex-col divide-y divide-border">
              {costRows.map((row) => (
                <div key={row.label} className="flex items-baseline justify-between gap-3 py-1.5">
                  <dt className="flex flex-col">
                    <span className="text-muted">{row.label}</span>
                    {row.note}
                  </dt>
                  <dd className="tabular-nums">{euros(row.cents)}</dd>
                </div>
              ))}
              <div className="flex items-baseline justify-between gap-3 py-1.5 font-medium">
                <dt>{t("totalCost")}</dt>
                <dd className="font-display text-xl tabular-nums" data-testid="pricing-cost">
                  {euros(sheet.perPortion.totalCents)}
                </dd>
              </div>
            </dl>
          </section>

          <section className="flex flex-col gap-2">
            <h4 className="font-medium">
              {t("suggestedTitle", { coefficient: format.number(effectiveCoefficient) })}
            </h4>
            <p className="text-xs text-muted">
              {sheet.laborCounted || sheet.energyCounted
                ? t("suggestedHint", { coefficient: format.number(effectiveCoefficient) })
                : t("suggestedHintMaterial", { coefficient: format.number(effectiveCoefficient) })}
            </p>
            <dl className="flex flex-col divide-y divide-border">
              <Row label={t("priceHt")} value={euros(sheet.suggested.priceExclTaxCents)} />
              <Row
                label={t("priceTtc", { vat: format.number(vatRate) })}
                value={euros(sheet.suggested.priceInclTaxCents)}
                strong
                testId="suggested-ttc"
              />
              <Row label={t("grossMargin")} value={euros(sheet.suggested.onMaterial.grossMarginCents)} />
              <Row label={t("foodCostRatio")} value={percent(sheet.suggested.foodCostRatio)} />
              <Row
                label={t("netMargin")}
                value={euros(sheet.suggested.netMarginCents)}
                negative={sheet.suggested.netMarginCents < 0}
              />
            </dl>
          </section>

          <section className="flex flex-col gap-2" data-testid="actual">
            <h4 className="font-medium">{t("actualTitle")}</h4>
            {actual && actual.netMarginCents < 0 ? (
              <Notice tone="warning">{t("belowCost", { cost: euros(sheet.perPortion.totalCents) })}</Notice>
            ) : null}
            {actual ? (
              <dl className="flex flex-col divide-y divide-border">
                <Row label={t("priceHt")} value={euros(actual.priceExclTaxCents)} />
                <Row
                  label={t("priceTtc", { vat: format.number(vatRate) })}
                  value={euros(actual.priceInclTaxCents)}
                  strong
                />
                <Row
                  label={t("grossMargin")}
                  value={euros(actual.onMaterial.grossMarginCents)}
                  testId="actual-margin"
                />
                <Row label={t("markupRate")} value={percent(actual.onMaterial.markupRate)} />
                <Row label={t("marginRate")} value={percent(actual.onMaterial.marginRate)} />
                <Row
                  label={t("realCoefficient")}
                  value={
                    actual.onMaterial.coefficient === null
                      ? "—"
                      : format.number(actual.onMaterial.coefficient, { maximumFractionDigits: 2 })
                  }
                />
                <Row label={t("foodCostRatio")} value={percent(actual.foodCostRatio)} />
                <Row
                  label={t("netMargin")}
                  value={euros(actual.netMarginCents)}
                  negative={actual.netMarginCents < 0}
                  testId="actual-net"
                />
              </dl>
            ) : (
              <p className="text-muted">{t("actualEmpty")}</p>
            )}
          </section>
        </div>

        <form
          className="flex flex-col gap-4 border-t border-border pt-5"
          onSubmit={(event) => {
            event.preventDefault();
            void save();
          }}
        >
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Field label={t("coefficient")} hint={t("coefficientHint")}>
              {(control) => (
                <Input
                  {...control}
                  inputMode="decimal"
                  value={coefficient}
                  onChange={(e) => setCoefficient(e.target.value)}
                />
              )}
            </Field>
            <Field label={t("vatRate")} hint={t("vatHint")}>
              {(control) => (
                <Select {...control} value={vatRate} onChange={(e) => setVatRate(Number(e.target.value))}>
                  {VAT_RATES.map((rate) => (
                    <option key={rate} value={rate}>
                      {format.number(rate / 100, { style: "percent", maximumFractionDigits: 1 })}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <Field label={t("sellingPrice")} hint={t("sellingPriceHint")}>
              {(control) => (
                <Input
                  {...control}
                  inputMode="decimal"
                  placeholder="14,90"
                  value={sellingTtc}
                  onChange={(e) => setSellingTtc(e.target.value)}
                />
              )}
            </Field>
            <Field label={t("laborMinutes")} hint={t("laborHint", { count: recipe.servings })}>
              {(control) => (
                <Input
                  {...control}
                  inputMode="decimal"
                  value={laborMinutes}
                  onChange={(e) => setLaborMinutes(e.target.value)}
                />
              )}
            </Field>
          </div>
          {appliances.length > 0 ? (
            <div className="flex flex-col gap-2">
              <p className="font-medium">{t("energyTitle")}</p>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {appliances.map((appliance) => (
                  <Field
                    key={appliance.id}
                    label={t("applianceMinutes", { name: appliance.name })}
                    hint={t("appliancePower", { power: format.number(appliance.powerW) })}
                  >
                    {(control) => (
                      <Input
                        {...control}
                        inputMode="decimal"
                        placeholder="0"
                        value={energy[appliance.id] ?? ""}
                        onChange={(e) => setEnergy((all) => ({ ...all, [appliance.id]: e.target.value }))}
                      />
                    )}
                  </Field>
                ))}
              </div>
            </div>
          ) : null}
          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" disabled={saving}>
              {t("save")}
            </Button>
            <span className="text-xs text-muted">{t("disclaimer")}</span>
          </div>
          {message ? <Notice tone={message.tone}>{message.text}</Notice> : null}
        </form>
      </CardBody>
    </Card>
  );
}

function Row({
  label,
  value,
  strong,
  negative,
  testId,
}: {
  label: string;
  value: string;
  strong?: boolean;
  negative?: boolean;
  testId?: string;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1.5">
      <dt className="text-muted">{label}</dt>
      <dd
        data-testid={testId}
        className={cx(
          "tabular-nums",
          strong && "font-display text-xl",
          negative && "font-medium text-danger",
        )}
      >
        {value}
      </dd>
    </div>
  );
}

function SettingsLink({ text }: { text: string }) {
  return (
    <Link href="/app/reglages" className="text-xs text-primary hover:underline">
      {text}
    </Link>
  );
}
