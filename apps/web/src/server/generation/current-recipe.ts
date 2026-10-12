/**
 * Recette enregistrée remise au format de sortie de l'IA (GeneratedRecipe), pour
 * la modification par instruction : références i1, i2… et jetons {{i3}} recréés.
 */
import type { GeneratedRecipe } from "@culinova/ai";
import { remapStepQuantityTokens } from "@culinova/core";
import type { Database } from "@culinova/db";
import * as s from "@culinova/db/schema";
import { asc, eq } from "drizzle-orm";

export async function loadGeneratedRecipe(db: Database, versionId: string): Promise<GeneratedRecipe | null> {
  return (await loadGeneratedRecipeWithIds(db, versionId))?.recipe ?? null;
}

/** Idem, avec les identifiants des lignes et des étapes (dans l'ordre des références i1, i2…). */
export async function loadGeneratedRecipeWithIds(
  db: Database,
  versionId: string,
): Promise<{ recipe: GeneratedRecipe; lineIds: string[]; stepIds: string[] } | null> {
  const [version] = await db.select().from(s.recipeVersions).where(eq(s.recipeVersions.id, versionId));
  if (!version) return null;
  const [lines, steps] = await Promise.all([
    db
      .select()
      .from(s.recipeIngredients)
      .where(eq(s.recipeIngredients.recipeVersionId, versionId))
      .orderBy(asc(s.recipeIngredients.sortOrder)),
    db
      .select()
      .from(s.recipeSteps)
      .where(eq(s.recipeSteps.recipeVersionId, versionId))
      .orderBy(asc(s.recipeSteps.sortOrder)),
  ]);
  const refOf = new Map(lines.map((line, index) => [line.id, `i${index + 1}`]));
  const plating = (version.plating ?? {}) as Partial<GeneratedRecipe["plating"]>;
  const recipe: GeneratedRecipe = {
    name: version.name,
    description: version.description ?? "",
    servings: version.servings,
    difficulty: version.difficulty ?? "medium",
    prepTimeSeconds: version.prepS ?? 0,
    cookTimeSeconds: version.cookS ?? 0,
    restTimeSeconds: version.restS ?? 0,
    season: version.season,
    equipment: version.equipment,
    cuisineLabel: version.cuisineLabel ?? "",
    fusionLabel: version.fusionLabel,
    ingredients: lines.map((line) => ({
      ref: refOf.get(line.id)!,
      name: line.label,
      quantity: Number(line.quantityG ?? line.quantityMl ?? line.quantityPiece ?? 0),
      unit: line.quantityG !== null ? "g" : line.quantityMl !== null ? "ml" : "piece",
      displayQuantity: line.displayQuantity === null ? null : Number(line.displayQuantity),
      displayUnit: line.displayUnit,
      preparation: line.preparation,
      group: line.groupLabel,
      optional: line.optional,
      storeBought: line.storeBought ?? false,
    })),
    steps: steps.map((step) => ({
      phase: step.phase,
      action: remapStepQuantityTokens(step.action, refOf),
      ingredientRefs: step.ingredientRefs.flatMap((id) => (refOf.has(id) ? [refOf.get(id)!] : [])),
      temperatureC: step.temperatureC,
      durationSeconds: step.durationS,
      equipment: step.equipment,
      expectedResult: step.expectedResult,
      timer: step.timer,
    })),
    plating: {
      description: plating.description ?? "",
      plate: plating.plate ?? "",
      positioning: plating.positioning ?? "",
      quantities: plating.quantities ?? "",
      sauce: plating.sauce ?? null,
      garnish: plating.garnish ?? null,
      finish: plating.finish ?? null,
      decoration: plating.decoration ?? null,
    },
    allergens: version.allergens as GeneratedRecipe["allergens"],
    diets: version.diets,
    tips: version.tips,
  };
  return { recipe, lineIds: lines.map((l) => l.id), stepIds: steps.map((st) => st.id) };
}
