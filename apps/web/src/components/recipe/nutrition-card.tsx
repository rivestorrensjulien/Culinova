"use client";

import type { NutrientKey } from "@culinova/core";
import { Badge, Button, Card, CardBody, Input, Notice, Spinner } from "@culinova/ui";
import { useFormatter, useTranslations } from "next-intl";
import { useState } from "react";
import {
  computeNutritionAction,
  searchFoodsAction,
  setNutritionLinkAction,
  validateNutritionAction,
} from "@/server/actions/nutrition";
import type { RecipeView as RecipeData } from "@/server/generation/view";

/** Lignes de l'étiquette, dans l'ordre réglementaire européen. */
const ROWS: Array<{ key: NutrientKey; unit: "g" | "kcal"; indent?: boolean }> = [
  { key: "kcal", unit: "kcal" },
  { key: "fat", unit: "g" },
  { key: "saturated", unit: "g", indent: true },
  { key: "carbs", unit: "g" },
  { key: "sugars", unit: "g", indent: true },
  { key: "fiber", unit: "g" },
  { key: "protein", unit: "g" },
  { key: "salt", unit: "g" },
];

type FoodResult = Awaited<ReturnType<typeof searchFoodsAction>>[number];

/**
 * Valeurs nutritionnelles d'une recette (table Ciqual de l'ANSES, USDA en complément).
 * L'IA propose une correspondance par ingrédient ; la personne la valide ou la corrige.
 */
export function NutritionCard({ recipe, onChanged }: { recipe: RecipeData; onChanged: () => Promise<void> }) {
  const t = useTranslations("Nutrition");
  const format = useFormatter();
  const { nutrition } = recipe;
  const isBase = recipe.kind === "base";
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<FoodResult[]>([]);

  const missing = nutrition.lines.filter((line) => line.status === "none" && line.ingredientId).length;
  const started = nutrition.lines.some((line) => line.status !== "none");

  const compute = async () => {
    setBusy(true);
    setError(null);
    const result = await computeNutritionAction(recipe.recipeId).catch(() => null);
    if (result && !result.ok && result.reason !== "empty") setError(t(`errors.${result.reason}`));
    if (!result) setError(t("errors.failed"));
    await onChanged();
    setBusy(false);
  };

  const choose = async (ingredientId: string, foodId: string | null) => {
    setBusy(true);
    await setNutritionLinkAction(ingredientId, foodId).catch(() => false);
    setEditing(null);
    setQuery("");
    setResults([]);
    await onChanged();
    setBusy(false);
  };

  const value = (key: NutrientKey, values: Record<NutrientKey, number>) =>
    key === "kcal"
      ? `${format.number(values.kj)} kJ / ${format.number(values.kcal)} kcal`
      : `${format.number(values[key], { maximumFractionDigits: key === "salt" ? 2 : 1 })} g`;

  return (
    <Card data-testid="nutrition">
      <CardBody className="flex flex-col gap-5 text-sm">
        <div className="flex flex-col gap-1">
          <h3 className="font-display text-2xl">{t("title")}</h3>
          <p className="text-muted">{t("subtitle")}</p>
        </div>
        {error ? <Notice tone="danger">{error}</Notice> : null}

        {!started ? (
          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={compute} disabled={busy}>
              {t("compute")}
            </Button>
            {busy ? (
              <span className="flex items-center gap-2 text-muted">
                <Spinner /> {t("computing")}
              </span>
            ) : (
              <span className="text-muted">{t("computeHint")}</span>
            )}
          </div>
        ) : (
          <>
            <table className="w-full max-w-xl text-left" data-testid="nutrition-table">
              <thead>
                <tr className="border-b border-border text-muted">
                  <th className="py-1.5 font-normal">{t("nutrient")}</th>
                  <th className="py-1.5 text-right font-normal">{t("per100g")}</th>
                  {isBase ? null : <th className="py-1.5 text-right font-normal">{t("perPortion")}</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {ROWS.map((row) => (
                  <tr key={row.key} data-testid={`nutrient-${row.key}`}>
                    <td className={row.indent ? "py-1.5 pl-4 text-muted" : "py-1.5"}>
                      {t(`nutrients.${row.key}`)}
                    </td>
                    <td className="py-1.5 text-right tabular-nums">{value(row.key, nutrition.per100g)}</td>
                    {isBase ? null : (
                      <td className="py-1.5 text-right font-medium tabular-nums">
                        {value(row.key, nutrition.perPortion)}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="text-muted">
              {t("coverage", { counted: nutrition.counted, total: nutrition.lineCount })}
            </p>
            {missing > 0 ? (
              <div className="flex flex-wrap items-center gap-3">
                <Button size="sm" variant="secondary" onClick={compute} disabled={busy}>
                  {t("complete", { count: missing })}
                </Button>
                {busy ? <Spinner /> : null}
              </div>
            ) : null}
            {nutrition.toValidate > 0 ? (
              <Notice tone="warning">
                <span className="flex flex-wrap items-center gap-3">
                  {t("toValidate", { count: nutrition.toValidate })}
                  <Button
                    size="sm"
                    disabled={busy}
                    onClick={async () => {
                      setBusy(true);
                      await validateNutritionAction(recipe.recipeId).catch(() => 0);
                      await onChanged();
                      setBusy(false);
                    }}
                  >
                    {t("validateAll")}
                  </Button>
                </span>
              </Notice>
            ) : null}

            <details className="flex flex-col gap-2" data-testid="nutrition-matches">
              <summary className="cursor-pointer font-medium">{t("matchesTitle")}</summary>
              <ul className="mt-2 flex flex-col divide-y divide-border">
                {nutrition.lines.map((line, index) => (
                  <li key={`${line.ingredientId ?? "x"}-${index}`} className="flex flex-col gap-2 py-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span>
                        <span className="font-medium">{line.label}</span>
                        <span className="text-muted"> → </span>
                        {line.status === "homemade" ? (
                          <span className="text-muted">{t("homemade")}</span>
                        ) : line.food ? (
                          <>
                            {line.food.name}{" "}
                            <Badge tone={line.food.source === "ciqual" ? "sage" : "accent"}>
                              {line.food.source === "ciqual" ? "Ciqual" : "USDA"}
                            </Badge>
                          </>
                        ) : (
                          <span className="text-muted">
                            {line.status === "none" ? t("noMatchYet") : t("ignored")}
                          </span>
                        )}
                        {line.status === "proposed" ? (
                          <span className="text-warning"> · {t("statusProposed")}</span>
                        ) : null}
                      </span>
                      {line.ingredientId && line.status !== "homemade" ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            setEditing(editing === line.ingredientId ? null : line.ingredientId);
                            setQuery(line.label);
                            setResults([]);
                          }}
                        >
                          {t("change")}
                        </Button>
                      ) : null}
                    </div>
                    {editing && editing === line.ingredientId ? (
                      <div className="flex flex-col gap-2 rounded-md bg-raised p-3">
                        <form
                          className="flex gap-2"
                          onSubmit={async (event) => {
                            event.preventDefault();
                            setResults(await searchFoodsAction(query).catch(() => []));
                          }}
                        >
                          <Input
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            aria-label={t("searchLabel")}
                            placeholder={t("searchLabel")}
                          />
                          <Button type="submit" size="sm" variant="secondary">
                            {t("search")}
                          </Button>
                        </form>
                        <ul className="flex flex-col gap-1">
                          {results.map((food) => (
                            <li key={food.id}>
                              <button
                                type="button"
                                className="cursor-pointer text-left text-primary hover:underline"
                                disabled={busy}
                                onClick={() => choose(line.ingredientId!, food.id)}
                              >
                                {food.name}
                              </button>
                            </li>
                          ))}
                        </ul>
                        <button
                          type="button"
                          className="cursor-pointer self-start text-xs text-muted hover:underline"
                          disabled={busy}
                          onClick={() => choose(line.ingredientId!, null)}
                        >
                          {t("ignore")}
                        </button>
                      </div>
                    ) : null}
                  </li>
                ))}
              </ul>
            </details>
          </>
        )}
        <p className="text-xs text-muted">{t("source")}</p>
      </CardBody>
    </Card>
  );
}
