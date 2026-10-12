/** Enregistrement d'une recette générée : recette, version, ingrédients rapprochés, étapes. */
import type { GeneratedRecipe, SocialContent } from "@culinova/ai";
import { remapStepQuantityTokens } from "@culinova/core";
import type { Database } from "@culinova/db";
import { recipeIngredients, recipes, recipeSteps, recipeVersions, socialContents } from "@culinova/db/schema";
import { and, eq, isNotNull, sql } from "drizzle-orm";
import { matchIngredients } from "./matching";

type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];

export interface SaveVersionInput {
  ownerId: string;
  /** Recette existante (régénération) ; absente = nouvelle recette. */
  recipeId?: string | null;
  recipe: GeneratedRecipe;
  languageCode: "fr" | "en";
  momentId: string | null;
  generationParamsId: string | null;
  changeNote: string | null;
  /** « base » pour une préparation de « Mes bases » (par défaut : un plat). */
  kind?: "dish" | "base";
  /** Poids produit par une base, en grammes. */
  yieldG?: number | null;
  /** Origine d'une nouvelle recette (par défaut : générée). */
  source?: "generated" | "imported";
}

export async function saveRecipeVersion(
  tx: Tx,
  input: SaveVersionInput,
): Promise<{ recipeId: string; versionId: string; versionNo: number; createdIngredients: number }> {
  const { recipe } = input;
  let recipeId = input.recipeId ?? null;
  if (!recipeId) {
    const [created] = await tx
      .insert(recipes)
      .values({
        ownerId: input.ownerId,
        kind: input.kind ?? "dish",
        source: input.source ?? "generated",
        originalLanguage: input.languageCode,
        status: "ready",
      })
      .returning({ id: recipes.id });
    recipeId = created!.id;
  }

  const [{ next } = { next: 1 }] = await tx
    .select({ next: sql<number>`coalesce(max(${recipeVersions.versionNo}), 0)::int + 1` })
    .from(recipeVersions)
    .where(eq(recipeVersions.recipeId, recipeId));

  const [version] = await tx
    .insert(recipeVersions)
    .values({
      recipeId,
      versionNo: next,
      name: recipe.name,
      description: recipe.description,
      momentId: input.momentId,
      servings: recipe.servings,
      prepS: recipe.prepTimeSeconds,
      cookS: recipe.cookTimeSeconds,
      restS: recipe.restTimeSeconds,
      difficulty: recipe.difficulty,
      season: recipe.season,
      equipment: recipe.equipment,
      plating: recipe.plating,
      fusionLabel: recipe.fusionLabel,
      cuisineLabel: recipe.cuisineLabel,
      allergens: recipe.allergens,
      diets: recipe.diets,
      tips: recipe.tips,
      yieldG: input.yieldG === undefined || input.yieldG === null ? null : Math.round(input.yieldG),
      generationParamsId: input.generationParamsId,
      changeNote: input.changeNote,
      createdBy: input.ownerId,
    })
    .returning({ id: recipeVersions.id });

  const matches = await matchIngredients(
    tx,
    input.ownerId,
    recipe.ingredients.map((i) => ({ name: i.name, unit: i.unit })),
    input.languageCode,
  );

  // Régénération : les préparations déjà faites maison restent liées à leur base.
  const previousBases = await homemadeBasesOf(tx, recipeId);

  const refToRow = new Map<string, string>();
  const rows = await tx
    .insert(recipeIngredients)
    .values(
      recipe.ingredients.map((ingredient, index) => ({
        recipeVersionId: version!.id,
        ingredientId: matches[index]!.ingredientId,
        label: ingredient.name,
        quantityG: ingredient.unit === "g" ? String(ingredient.quantity) : null,
        quantityMl: ingredient.unit === "ml" ? String(ingredient.quantity) : null,
        quantityPiece: ingredient.unit === "piece" ? String(ingredient.quantity) : null,
        displayUnit: ingredient.displayUnit,
        displayQuantity: ingredient.displayQuantity === null ? null : String(ingredient.displayQuantity),
        preparation: ingredient.preparation,
        groupLabel: ingredient.group,
        sortOrder: index,
        optional: ingredient.optional,
        storeBought: ingredient.storeBought,
        baseRecipeId:
          previousBases.byIngredient.get(matches[index]!.ingredientId ?? "") ??
          previousBases.byLabel.get(ingredient.name.trim().toLowerCase()) ??
          null,
      })),
    )
    .returning({ id: recipeIngredients.id, sortOrder: recipeIngredients.sortOrder });
  for (const row of rows) refToRow.set(recipe.ingredients[row.sortOrder]!.ref, row.id);

  await tx.insert(recipeSteps).values(
    recipe.steps.map((step, index) => ({
      recipeVersionId: version!.id,
      sortOrder: index,
      phase: step.phase,
      // Les jetons de quantité ({{i3}}) pointent ensuite vers la ligne d'ingrédient.
      action: remapStepQuantityTokens(step.action, refToRow),
      ingredientRefs: step.ingredientRefs.map((ref) => refToRow.get(ref)!).filter(Boolean),
      temperatureC: step.temperatureC === null ? null : Math.round(step.temperatureC),
      durationS: step.durationSeconds === null ? null : Math.round(step.durationSeconds),
      equipment: step.equipment,
      expectedResult: step.expectedResult,
      timer: step.timer,
    })),
  );

  await tx
    .update(recipes)
    .set({ currentVersionId: version!.id, status: "ready" })
    .where(eq(recipes.id, recipeId));
  return {
    recipeId,
    versionId: version!.id,
    versionNo: next,
    createdIngredients: matches.filter((m) => m.created).length,
  };
}

/** Bases liées aux lignes de la version active d'une recette (par ingrédient et par libellé). */
async function homemadeBasesOf(tx: Tx, recipeId: string) {
  const rows = await tx
    .select({
      ingredientId: recipeIngredients.ingredientId,
      label: recipeIngredients.label,
      baseRecipeId: recipeIngredients.baseRecipeId,
    })
    .from(recipes)
    .innerJoin(recipeIngredients, eq(recipeIngredients.recipeVersionId, recipes.currentVersionId))
    .where(and(eq(recipes.id, recipeId), isNotNull(recipeIngredients.baseRecipeId)));
  const byIngredient = new Map<string, string>();
  const byLabel = new Map<string, string>();
  for (const row of rows) {
    if (row.ingredientId) byIngredient.set(row.ingredientId, row.baseRecipeId!);
    byLabel.set(row.label.trim().toLowerCase(), row.baseRecipeId!);
  }
  return { byIngredient, byLabel };
}

/** Enregistre le contenu social (une ligne par plateforme). */
export async function saveSocialContent(
  tx: Tx | Database,
  versionId: string,
  languageCode: "fr" | "en",
  social: SocialContent,
): Promise<void> {
  await tx.insert(socialContents).values([
    {
      recipeVersionId: versionId,
      platform: "generic",
      languageCode,
      title: social.title,
      description: social.description,
      caption: social.shortText,
      hashtags: social.hashtags,
    },
    {
      recipeVersionId: versionId,
      platform: "instagram",
      languageCode,
      caption: social.instagramCaption,
      hashtags: social.hashtags,
    },
    { recipeVersionId: versionId, platform: "tiktok", languageCode, caption: social.tiktok },
    { recipeVersionId: versionId, platform: "pinterest", languageCode, description: social.pinterest },
    { recipeVersionId: versionId, platform: "linkedin", languageCode, caption: social.linkedin },
  ]);
}
