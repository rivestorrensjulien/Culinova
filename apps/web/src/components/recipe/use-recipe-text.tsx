"use client";

import { isTimedStep, mentionsDuration, splitStepText } from "@culinova/core";
import { useFormatter, useTranslations } from "next-intl";
import { type ReactNode, useCallback } from "react";
import type { RecipeView as RecipeData } from "@/server/generation/view";
import { formatDuration, ingredientAmount } from "./format";

type Ingredient = RecipeData["ingredients"][number];
/** Ce qu'il faut d'une étape pour retrouver sa durée. */
type StepTiming = Pick<RecipeData["steps"][number], "durationS" | "timer" | "temperatureC" | "phase">;

/**
 * Textes d'une recette recalculés pour un autre nombre de personnes (ou un autre poids,
 * pour une base) : quantité d'un ingrédient et consigne d'une étape avec ses quantités.
 * Partagé par la page recette, la fiche technique et le mode préparation.
 */
export function useRecipeText(recipe: RecipeData, scaleFrom: number, scaleTo: number) {
  const t = useTranslations("Recipe");
  const format = useFormatter();

  const measure = useCallback(
    (ingredient: Ingredient, part: number | null) => {
      const amount = ingredientAmount(ingredient, part, scaleFrom, scaleTo);
      const unit = t(`units.${amount.unit}`);
      const main = `${format.number(amount.value, { maximumFractionDigits: 2 })}${unit ? ` ${unit}` : ""}`;
      const kitchen = amount.kitchen ? `${format.number(amount.kitchen.value)} ${amount.kitchen.unit}` : null;
      return { main, kitchen };
    },
    [scaleFrom, scaleTo, t, format],
  );

  /** Quantité d'un ingrédient (ou d'une partie) : grammes, puis mesure parlante entre parenthèses. */
  const amountText = useCallback(
    (ingredient: Ingredient, part: number | null = null) => {
      const { main, kitchen } = measure(ingredient, part);
      return kitchen ? `${main} (${kitchen})` : main;
    },
    [measure],
  );

  /**
   * Consigne d'une étape, quantités recalculées entre parenthèses après le nom de
   * l'ingrédient : « les carottes (100 g) », « le sel (5 g, 1 c. à café) ». Les recettes
   * plus anciennes écrivaient « {{i3}} de mascarpone » : le poids reste alors sans parenthèses.
   */
  const stepText = useCallback(
    (action: string, step?: StepTiming): ReactNode[] => {
      const byId = new Map(recipe.ingredients.map((i) => [i.id, i]));
      // Anciennes recettes : durée connue mais absente de la phrase → ajoutée à la fin.
      const missing =
        step && isTimedStep({ ...step, durationSeconds: step.durationS }) && !mentionsDuration(action)
          ? ` (${formatDuration(step.durationS!)})`
          : "";
      const parts = splitStepText(action).map((segment, i, all) => {
        if (segment.kind === "text") return segment.text;
        const ingredient = byId.get(segment.ref);
        if (!ingredient) return "";
        const next = all[i + 1];
        const nextText = next?.kind === "text" ? next.text : "";
        let text: string;
        if (/^\s+(de|d['’])/i.test(nextText)) text = amountText(ingredient, segment.part);
        else {
          const { main, kitchen } = measure(ingredient, segment.part);
          text = kitchen ? `(${main}, ${kitchen})` : `(${main})`;
        }
        return (
          <span key={i} className="font-medium">
            {text}
          </span>
        );
      });
      if (!missing) return parts;
      const last = parts.length - 1;
      const tail = typeof parts[last] === "string" ? (parts[last] as string) : "";
      const stop = tail.match(/[.!…]\s*$/)?.[0] ?? "";
      if (stop) parts[last] = tail.slice(0, -stop.length);
      return [
        ...parts,
        <span key="duration" className="font-medium">
          {missing}
        </span>,
        stop,
      ];
    },
    [recipe.ingredients, amountText, measure],
  );

  return { amountText, stepText };
}
