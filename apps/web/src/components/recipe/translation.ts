import type { RecipeView } from "@/server/generation/view";
import type { TranslationPayload } from "@/server/translation";

/** Recette affichée dans sa version traduite (les quantités, calculées, ne changent pas). */
export function applyTranslation(recipe: RecipeView, payload: TranslationPayload): RecipeView {
  return {
    ...recipe,
    name: payload.name,
    description: payload.description,
    cuisineLabel: payload.cuisineLabel || recipe.cuisineLabel,
    fusionLabel: payload.fusionLabel,
    equipment: payload.equipment,
    tips: payload.tips,
    ingredients: recipe.ingredients.map((ingredient) => {
      const translated = payload.ingredients[ingredient.id];
      return translated
        ? {
            ...ingredient,
            label: translated.label,
            displayUnit: translated.displayUnit ?? ingredient.displayUnit,
          }
        : ingredient;
    }),
    steps: recipe.steps.map((step) => {
      const translated = payload.steps[step.id];
      return translated
        ? { ...step, action: translated.action, expectedResult: translated.expectedResult }
        : step;
    }),
    plating: recipe.plating ? { ...recipe.plating, description: payload.platingDescription } : null,
  };
}
