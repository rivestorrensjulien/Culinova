"use client";

import { Input } from "@culinova/ui";
import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import { MAX_FUSION_CUISINES, type WizardState } from "@/lib/wizard";
import type { CulinaryReference } from "@/server/generation/reference";
import { Chip } from "./select-card";

function normalize(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

export function PrecisionStep({
  reference,
  state,
  update,
  favorites,
  recents,
  onToggleFavorite,
}: {
  reference: CulinaryReference;
  state: WizardState;
  update: (patch: Partial<WizardState>) => void;
  favorites: string[];
  recents: string[];
  onToggleFavorite: (code: string) => void;
}) {
  const t = useTranslations("Wizard");
  const [query, setQuery] = useState("");
  const influence = reference.influences.find((i) => i.code === state.influenceCode);
  const regions =
    influence?.kind === "zone"
      ? reference.regions.filter((r) => r.influenceCode === influence.code)
      : reference.regions;
  const countries = state.regionCode
    ? reference.countries.filter((c) => c.regionCode === state.regionCode)
    : [];
  const cuisinesOfCountry = state.countryIso
    ? reference.cuisines.filter((c) => c.countryIso === state.countryIso)
    : [];
  const cuisineByCode = new Map(reference.cuisines.map((c) => [c.code, c]));

  const results = useMemo(() => {
    const q = normalize(query.trim());
    if (q.length < 2) return null;
    return {
      cuisines: reference.cuisines.filter((c) => normalize(c.label).includes(q)).slice(0, 20),
      countries: reference.countries.filter((c) => normalize(c.label).includes(q)).slice(0, 10),
    };
  }, [query, reference]);

  const full = state.cuisineCodes.length >= MAX_FUSION_CUISINES;
  const toggleCuisine = (code: string) => {
    const selected = state.cuisineCodes.includes(code);
    const cuisineCodes = selected
      ? state.cuisineCodes.filter((c) => c !== code)
      : [...state.cuisineCodes, code];
    // Une fusion n'est jamais présentée comme traditionnelle.
    const styleCode = cuisineCodes.length > 1 && state.styleCode === "traditional" ? null : state.styleCode;
    update({ cuisineCodes, styleCode });
  };
  const selectCountry = (iso: string) => {
    const country = reference.countries.find((c) => c.iso === iso);
    update({
      countryIso: state.countryIso === iso ? null : iso,
      regionCode: country?.regionCode ?? state.regionCode,
    });
  };

  const cuisineChip = (code: string) => {
    const cuisine = cuisineByCode.get(code);
    if (!cuisine) return null;
    const selected = state.cuisineCodes.includes(code);
    const favorite = favorites.includes(code);
    return (
      <span key={code} className="inline-flex items-center gap-0.5">
        <Chip selected={selected} disabled={!selected && full} onClick={() => toggleCuisine(code)}>
          {cuisine.label}
        </Chip>
        <button
          type="button"
          className="cursor-pointer px-1 text-sm text-gold"
          aria-label={favorite ? t("unfavorite") : t("favorite")}
          title={favorite ? t("unfavorite") : t("favorite")}
          onClick={() => onToggleFavorite(code)}
        >
          {favorite ? "★" : "☆"}
        </button>
      </span>
    );
  };

  return (
    <div className="flex flex-col gap-6">
      <p className="text-sm text-muted">{t("precisionHint")}</p>

      {(state.cuisineCodes.length > 0 || state.countryIso || state.regionCode) && (
        <div className="flex flex-col gap-2 rounded-lg border border-border bg-raised p-4">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">{t("selection")}</span>
            <button
              type="button"
              className="cursor-pointer text-sm text-primary hover:underline"
              onClick={() => update({ regionCode: null, countryIso: null, cuisineCodes: [] })}
            >
              {t("clear")}
            </button>
          </div>
          <p className="text-sm" data-testid="precision-selection">
            {[
              reference.regions.find((r) => r.code === state.regionCode)?.label,
              reference.countries.find((c) => c.iso === state.countryIso)?.label,
              state.cuisineCodes.map((c) => cuisineByCode.get(c)?.label).join(" × ") || null,
            ]
              .filter(Boolean)
              .join(" › ")}
          </p>
          {state.cuisineCodes.length > 1 ? <p className="text-sm text-sage">{t("fusion")}</p> : null}
          {full ? <p className="text-xs text-muted">{t("maxCuisines")}</p> : null}
        </div>
      )}

      <Input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={t("search")}
        aria-label={t("search")}
      />

      {results ? (
        <div className="flex flex-col gap-4">
          {results.cuisines.length + results.countries.length === 0 ? (
            <p className="text-sm text-muted">{t("noResult")}</p>
          ) : null}
          {results.cuisines.length > 0 ? (
            <section className="flex flex-col gap-2">
              <h3 className="text-sm font-medium">{t("cuisines")}</h3>
              <div className="flex flex-wrap gap-2">{results.cuisines.map((c) => cuisineChip(c.code))}</div>
            </section>
          ) : null}
          {results.countries.length > 0 ? (
            <section className="flex flex-col gap-2">
              <h3 className="text-sm font-medium">{t("countries")}</h3>
              <div className="flex flex-wrap gap-2">
                {results.countries.map((c) => (
                  <Chip
                    key={c.iso}
                    selected={state.countryIso === c.iso}
                    onClick={() => selectCountry(c.iso)}
                  >
                    {c.label}
                  </Chip>
                ))}
              </div>
            </section>
          ) : null}
        </div>
      ) : (
        <>
          {favorites.length > 0 ? (
            <section className="flex flex-col gap-2">
              <h3 className="text-sm font-medium">{t("favorites")}</h3>
              <div className="flex flex-wrap gap-2">{favorites.map(cuisineChip)}</div>
            </section>
          ) : null}
          {recents.length > 0 ? (
            <section className="flex flex-col gap-2">
              <h3 className="text-sm font-medium">{t("recents")}</h3>
              <div className="flex flex-wrap gap-2">
                {recents.filter((c) => !favorites.includes(c)).map(cuisineChip)}
              </div>
            </section>
          ) : null}
          <section className="flex flex-col gap-2">
            <h3 className="text-sm font-medium">{t("regions")}</h3>
            <div className="flex flex-wrap gap-2">
              {regions.map((r) => (
                <Chip
                  key={r.code}
                  selected={state.regionCode === r.code}
                  onClick={() =>
                    update({ regionCode: state.regionCode === r.code ? null : r.code, countryIso: null })
                  }
                >
                  {r.label}
                </Chip>
              ))}
            </div>
          </section>
          {countries.length > 0 ? (
            <section className="flex flex-col gap-2">
              <h3 className="text-sm font-medium">{t("countries")}</h3>
              <div className="flex flex-wrap gap-2">
                {countries.map((c) => (
                  <Chip
                    key={c.iso}
                    selected={state.countryIso === c.iso}
                    onClick={() => selectCountry(c.iso)}
                  >
                    {c.label}
                  </Chip>
                ))}
              </div>
            </section>
          ) : null}
          {cuisinesOfCountry.length > 0 ? (
            <section className="flex flex-col gap-2">
              <h3 className="text-sm font-medium">{t("cuisines")}</h3>
              <div className="flex flex-wrap gap-2">
                {cuisinesOfCountry.sort((a, b) => a.level - b.level).map((c) => cuisineChip(c.code))}
              </div>
            </section>
          ) : null}
        </>
      )}
    </div>
  );
}
