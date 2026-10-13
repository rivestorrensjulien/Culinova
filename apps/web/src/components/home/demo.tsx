"use client";

import { cx } from "@culinova/ui";
import { useFormatter, useTranslations } from "next-intl";
import { useId, useState } from "react";

export interface DemoExample {
  chip: string;
  name: string;
  meta: string;
  /** Quantités pour 4 personnes, en grammes. */
  ingredients: Array<{ name: string; g: number; piece?: { g: number; one: string; many: string } }>;
  /** Coût matière d'une portion et prix conseillé TTC d'une portion, en centimes. */
  costCents: number;
  priceCents: number;
}

const BASE_SERVINGS = 4;

function roundGrams(value: number): number {
  if (value >= 100) return Math.round(value / 5) * 5;
  return Math.max(1, Math.round(value));
}

/**
 * Démo de la page d'accueil : quelques fiches préparées à l'avance (aucun appel à l'IA),
 * avec le nombre de personnes qui recalcule les quantités et le coût total en direct.
 */
export function HomeDemo({ examples }: { examples: DemoExample[] }) {
  const t = useTranslations("Home.demo");
  const format = useFormatter();
  const [index, setIndex] = useState(0);
  const [servings, setServings] = useState(BASE_SERVINGS);
  const sliderId = useId();
  const example = examples[index] ?? examples[0];
  if (!example) return null;
  const ratio = servings / BASE_SERVINGS;
  const euros = (cents: number) => format.number(cents / 100, { style: "currency", currency: "EUR" });

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_1.2fr] lg:items-start">
      <div className="flex flex-col gap-6">
        <div role="radiogroup" aria-label={t("choose")} className="flex flex-wrap gap-2">
          {examples.map((item, i) => (
            <button
              key={item.chip}
              type="button"
              role="radio"
              aria-checked={i === index}
              onClick={() => setIndex(i)}
              className={cx(
                "cursor-pointer rounded-full border px-4 py-2 text-sm transition-colors",
                i === index
                  ? "border-foreground bg-foreground text-background"
                  : "border-border-strong bg-surface hover:bg-raised",
              )}
            >
              {item.chip}
            </button>
          ))}
        </div>
        <div className="flex flex-col gap-2">
          <label htmlFor={sliderId} className="text-sm font-medium">
            {t("servings", { count: servings })}
          </label>
          <input
            id={sliderId}
            type="range"
            min={2}
            max={12}
            step={1}
            value={servings}
            onChange={(e) => setServings(Number(e.target.value))}
            className="w-full max-w-sm cursor-pointer accent-primary"
            data-testid="demo-servings"
          />
        </div>
        <p className="text-sm text-muted">{t("note")}</p>
      </div>

      <div
        className="rounded-2xl border border-border bg-surface p-6 shadow-lg sm:p-8"
        aria-live="polite"
        data-testid="demo-card"
      >
        <p className="text-[11px] font-medium tracking-[0.2em] text-primary uppercase">{example.chip}</p>
        <p className="mt-2 font-display text-2xl leading-snug">{example.name}</p>
        <p className="mt-1 text-sm text-muted">
          {example.meta} · {t("people", { count: servings })}
        </p>
        <ul className="mt-5 grid gap-x-6 gap-y-1.5 text-sm sm:grid-cols-2">
          {example.ingredients.map((ingredient) => {
            const grams = roundGrams(ingredient.g * ratio);
            const pieces = ingredient.piece ? Math.round((grams / ingredient.piece.g) * 2) / 2 : null;
            return (
              <li
                key={ingredient.name}
                className="flex justify-between gap-3 border-b border-border/70 pb-1.5"
              >
                <span>{ingredient.name}</span>
                <span className="text-right whitespace-nowrap tabular-nums">
                  {format.number(grams)} g
                  {ingredient.piece && pieces !== null ? (
                    <span className="text-muted">
                      {" "}
                      ({format.number(pieces)} {pieces > 1 ? ingredient.piece.many : ingredient.piece.one})
                    </span>
                  ) : null}
                </span>
              </li>
            );
          })}
        </ul>
        <dl className="mt-6 grid grid-cols-3 gap-3 border-t border-border pt-5">
          <div>
            <dt className="text-xs text-muted">{t("perPortion")}</dt>
            <dd className="font-display text-xl tabular-nums">{euros(example.costCents)}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted">{t("total")}</dt>
            <dd className="font-display text-xl tabular-nums" data-testid="demo-total">
              {euros(example.costCents * servings)}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted">{t("price")}</dt>
            <dd className="font-display text-xl text-primary tabular-nums">{euros(example.priceCents)}</dd>
          </div>
        </dl>
      </div>
    </div>
  );
}
