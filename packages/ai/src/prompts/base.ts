/**
 * Préparations « faites maison » (« Mes bases ») : recette d'un élément
 * habituellement acheté tout prêt (pains bao, pâte feuilletée…), dimensionnée
 * pour couvrir le besoin de la recette principale.
 */
import { z } from "zod";
import { generatedRecipeSchema, recipeProblems } from "../schemas";
import { RECIPE_SYSTEM_PROMPT } from "./recipe";

export const BASE_PROMPT_VERSION = "base.generate@1";

/** Une base qui produit moins de 150 g est rarement réaliste : le surplus se conserve. */
export const BASE_MIN_REALISTIC_YIELD_G = 150;

export const generatedBaseSchema = generatedRecipeSchema.extend({
  /** Poids de préparation obtenu, en grammes. */
  yieldG: z.number(),
  /** Mesure parlante du rendement (8 pains, 2 pâtons…), facultative. */
  yieldDisplayQuantity: z.number().nullable(),
  yieldDisplayUnit: z.string().nullable(),
  /** Conservation au réfrigérateur, en heures (null si sans objet). */
  shelfLifeHours: z.number().nullable(),
});

export type GeneratedBase = z.infer<typeof generatedBaseSchema>;

export interface BaseRequest {
  /** Nom de l'élément tel qu'écrit dans la recette principale (ex. « Pains bao »). */
  name: string;
  /** Besoin de la recette principale, en grammes. */
  neededG: number;
  /** Mesure parlante du besoin (8 pains), si connue. */
  neededDisplay: { quantity: number; unit: string } | null;
  recipe: { name: string; description: string | null; cuisine: string | null };
  language: "fr" | "en";
}

const LANGUAGE_NAMES = { fr: "français", en: "anglais (English)" } as const;

export function maxBaseYield(neededG: number): number {
  return Math.max(neededG * 1.6, BASE_MIN_REALISTIC_YIELD_G);
}

export function buildBasePrompt(request: BaseRequest): { system: string; user: string } {
  const need = request.neededDisplay
    ? `${request.neededG} g (${request.neededDisplay.quantity} ${request.neededDisplay.unit})`
    : `${request.neededG} g`;
  const context = [
    `Recette principale : « ${request.recipe.name} »${request.recipe.description ? ` — ${request.recipe.description}` : ""}`,
    request.recipe.cuisine ? `Cuisine : ${request.recipe.cuisine}` : null,
  ]
    .filter(Boolean)
    .join("\n");
  return {
    // Même texte fixe que les recettes (mis en cache) ; les règles propres aux bases sont ci-dessous.
    system: RECIPE_SYSTEM_PROMPT,
    user: `Rédige la recette maison d'une préparation de base, qui remplace un produit acheté tout prêt.

Préparation : ${request.name}
Quantité nécessaire : ${need}
${context}
Langue de la recette : ${LANGUAGE_NAMES[request.language]}

Règles propres à cette préparation de base :
- name : le nom de la préparation suivi de « maison » (ex. « Pains bao maison »).
- C'est une fournée, pas un plat servi : servings = 1.
- Dimensionne la recette pour produire au moins la quantité nécessaire : yieldG est le poids de préparation obtenu, en grammes, compris entre ${request.neededG} g et ${Math.round(maxBaseYield(request.neededG))} g. Arrondis à la pièce entière ou à une fournée réaliste ; si le besoin est très petit, produis une petite quantité réaliste (le surplus se conserve).
- yieldDisplayQuantity et yieldDisplayUnit : le nombre de pièces obtenues quand la préparation se compte (ex. 8 et « pains »), sinon null.
- Les temps (préparation, cuisson, repos, pousse) sont ceux de la préparation seule ; la pousse et le repos vont dans restTimeSeconds.
- plating : contenant de conservation et façon de réserver la préparation jusqu'à son utilisation (plating.description en une ou deux phrases, ex. « Réservez les pains sous un linge propre, dans le panier vapeur, jusqu'à la garniture. »).
- shelfLifeHours : durée de conservation au réfrigérateur, en heures (null si la préparation se fait au dernier moment).
- storeBought = false pour tous les ingrédients.
- Le style, les saveurs et le vocabulaire s'accordent avec la recette principale.`,
  };
}

/** Règles métier d'une base : celles d'une recette, plus le rendement attendu. */
export function baseProblems(base: GeneratedBase, neededG: number): string[] {
  const problems = recipeProblems(base, 1);
  if (!(base.yieldG >= neededG * 0.95)) {
    problems.push(`yieldG (${base.yieldG} g) ne couvre pas la quantité nécessaire (${neededG} g).`);
  } else if (base.yieldG > maxBaseYield(neededG)) {
    problems.push(
      `yieldG (${base.yieldG} g) est trop élevé : vise au plus ${Math.round(maxBaseYield(neededG))} g.`,
    );
  }
  if (base.shelfLifeHours !== null && base.shelfLifeHours < 0) problems.push("shelfLifeHours est négatif.");
  return problems;
}
