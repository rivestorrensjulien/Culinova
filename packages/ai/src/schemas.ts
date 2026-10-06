/**
 * Schémas Zod des sorties de l'IA. Toute réponse est validée avant d'être utilisée.
 * J0 : premier jet du schéma de recette (affiné au jalon J2).
 */
import { z } from "zod";

export const recipeIngredientSchema = z.object({
  name: z.string().min(1),
  /** Quantité en unité interne : grammes, millilitres ou pièces. */
  quantity: z.number().nonnegative(),
  unit: z.enum(["g", "ml", "piece"]),
  note: z.string().optional(),
});

export const recipeStepSchema = z.object({
  order: z.number().int().positive(),
  action: z.string().min(1),
  temperatureCelsius: z.number().optional(),
  durationSeconds: z.number().int().nonnegative().optional(),
  equipment: z.array(z.string()).default([]),
  expectedResult: z.string().optional(),
});

export const generatedRecipeSchema = z.object({
  name: z.string().min(1),
  servings: z.number().int().positive(),
  difficulty: z.enum(["easy", "medium", "hard"]),
  prepTimeSeconds: z.number().int().nonnegative(),
  cookTimeSeconds: z.number().int().nonnegative(),
  equipment: z.array(z.string()),
  ingredients: z.array(recipeIngredientSchema).min(1),
  steps: z.array(recipeStepSchema).min(1),
  plating: z.object({
    plate: z.string(),
    arrangement: z.string(),
    garnish: z.string().optional(),
    finish: z.string().optional(),
  }),
});

export type GeneratedRecipe = z.infer<typeof generatedRecipeSchema>;
