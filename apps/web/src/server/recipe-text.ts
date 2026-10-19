/**
 * Textes lisibles d'une recette, hors de l'application (page d'accueil, carrousels des
 * réseaux) : quantités pesées « 300 g (6 œufs) » et étapes avec les quantités entre parenthèses.
 */
import { splitStepText } from "@culinova/core";
import { ingredientAmount } from "@/components/recipe/format";
import type { RecipeView } from "./generation/view";

export function amountText(
  ingredient: RecipeView["ingredients"][number],
  part: number | null = null,
): string {
  const amount = ingredientAmount(ingredient, part, 1, 1);
  const unit = amount.unit === "piece" ? "" : ` ${amount.unit}`;
  const main = `${amount.value.toLocaleString("fr-FR", { maximumFractionDigits: 2 })}${unit}`;
  return amount.kitchen
    ? `${main} (${amount.kitchen.value.toLocaleString("fr-FR")} ${amount.kitchen.unit})`
    : main;
}

/** Consigne lisible : les jetons de quantité deviennent « (300 g) » après le nom de l'ingrédient. */
export function stepPlainText(view: RecipeView, action: string): string {
  const byId = new Map(view.ingredients.map((i) => [i.id, i]));
  return splitStepText(action)
    .map((segment, index, all) => {
      if (segment.kind === "text") return segment.text;
      const ingredient = byId.get(segment.ref);
      if (!ingredient) return "";
      const next = all[index + 1];
      if (next?.kind === "text" && /^\s+(de|d['’])/i.test(next.text))
        return amountText(ingredient, segment.part);
      return `(${amountText(ingredient, segment.part).replace(" (", ", ").replace(/\)$/, "")})`;
    })
    .join("")
    .replace(/\s+/g, " ")
    .trim();
}
