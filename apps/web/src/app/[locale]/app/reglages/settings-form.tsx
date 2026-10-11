"use client";

import { Button, Card, CardBody, Field, Input, Notice, Select } from "@culinova/ui";
import { useFormatter, useTranslations } from "next-intl";
import { useState } from "react";
import { centsToInput, numberToInput } from "@/lib/decimal";
import {
  addApplianceAction,
  addCommonAppliancesAction,
  removeApplianceAction,
  saveCostingSettingsAction,
} from "@/server/actions/pricing";
import type { ApplianceView, CostingSettingsView } from "@/server/costing/pricing";
import { VAT_RATES } from "@/server/costing/vat";

export function SettingsForm({
  settings,
  appliances: initialAppliances,
}: {
  settings: CostingSettingsView;
  appliances: ApplianceView[];
}) {
  const t = useTranslations("Settings");
  const format = useFormatter();
  const [coefficient, setCoefficient] = useState(numberToInput(settings.coefficient));
  const [vatRate, setVatRate] = useState(settings.vatRate);
  const [hourlyRate, setHourlyRate] = useState(centsToInput(settings.hourlyRateCents));
  const [kwhPrice, setKwhPrice] = useState(centsToInput(settings.kwhPriceCents));
  const [message, setMessage] = useState<{ tone: "success" | "danger"; text: string } | null>(null);
  const [saving, setSaving] = useState(false);

  const [appliances, setAppliances] = useState(initialAppliances);
  const [name, setName] = useState("");
  const [power, setPower] = useState("");
  const [applianceError, setApplianceError] = useState<string | null>(null);

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card>
        <CardBody>
          <form
            className="flex flex-col gap-4"
            onSubmit={async (event) => {
              event.preventDefault();
              setSaving(true);
              setMessage(null);
              const result = await saveCostingSettingsAction({
                coefficient,
                vatRate,
                hourlyRate,
                kwhPrice,
              }).catch(() => null);
              setSaving(false);
              if (result?.ok) setMessage({ tone: "success", text: t("saved") });
              else {
                const field = result && !result.ok ? result.field : null;
                setMessage({
                  tone: "danger",
                  text:
                    field && t.has(`invalid.${field}`)
                      ? t(`invalid.${field}` as "invalid.coefficient")
                      : t("error"),
                });
              }
            }}
          >
            <h2 className="font-display text-2xl">{t("defaultsTitle")}</h2>
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
            <Field label={t("hourlyRate")} hint={t("hourlyRateHint")}>
              {(control) => (
                <Input
                  {...control}
                  inputMode="decimal"
                  placeholder="20,00"
                  value={hourlyRate}
                  onChange={(e) => setHourlyRate(e.target.value)}
                />
              )}
            </Field>
            <Field label={t("kwhPrice")} hint={t("kwhPriceHint")}>
              {(control) => (
                <Input
                  {...control}
                  inputMode="decimal"
                  placeholder="0,25"
                  value={kwhPrice}
                  onChange={(e) => setKwhPrice(e.target.value)}
                />
              )}
            </Field>
            <div>
              <Button type="submit" disabled={saving}>
                {t("save")}
              </Button>
            </div>
            {message ? <Notice tone={message.tone}>{message.text}</Notice> : null}
          </form>
        </CardBody>
      </Card>

      <Card>
        <CardBody className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <h2 className="font-display text-2xl">{t("appliancesTitle")}</h2>
            <p className="text-sm text-muted">{t("appliancesIntro")}</p>
          </div>
          {appliances.length === 0 ? (
            <p className="text-sm text-muted">{t("appliancesEmpty")}</p>
          ) : (
            <ul className="divide-y divide-border text-sm" data-testid="appliances">
              {appliances.map((appliance) => (
                <li key={appliance.id} className="flex items-center justify-between gap-3 py-2">
                  <span>
                    {appliance.name}{" "}
                    <span className="text-muted">
                      · {t("watts", { power: format.number(appliance.powerW) })}
                    </span>
                  </span>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={async () => {
                      if (await removeApplianceAction(appliance.id).catch(() => false)) {
                        setAppliances((all) => all.filter((a) => a.id !== appliance.id));
                      }
                    }}
                  >
                    {t("remove")}
                  </Button>
                </li>
              ))}
            </ul>
          )}
          <Button
            variant="secondary"
            onClick={async () => {
              const list = await addCommonAppliancesAction().catch(() => null);
              if (list) setAppliances(list);
            }}
          >
            {t("addCommon")}
          </Button>
          <form
            className="grid gap-3 sm:grid-cols-[1fr_8rem_auto] sm:items-end"
            onSubmit={async (event) => {
              event.preventDefault();
              setApplianceError(null);
              const appliance = await addApplianceAction(name, power).catch(() => null);
              if (appliance) {
                setAppliances((all) => [...all, appliance]);
                setName("");
                setPower("");
              } else setApplianceError(t("applianceInvalid"));
            }}
          >
            <Field label={t("applianceName")}>
              {(control) => (
                <Input
                  {...control}
                  placeholder={t("applianceNamePlaceholder")}
                  maxLength={80}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              )}
            </Field>
            <Field label={t("appliancePower")}>
              {(control) => (
                <Input
                  {...control}
                  inputMode="numeric"
                  placeholder="2000"
                  value={power}
                  onChange={(e) => setPower(e.target.value)}
                />
              )}
            </Field>
            <Button type="submit" variant="secondary">
              {t("addAppliance")}
            </Button>
          </form>
          {applianceError ? <Notice tone="danger">{applianceError}</Notice> : null}
        </CardBody>
      </Card>
    </div>
  );
}
