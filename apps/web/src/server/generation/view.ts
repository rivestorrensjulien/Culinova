/** Données d'affichage d'une recette (version active, ou une version précédente), prêtes pour l'interface. */
import type { Database } from "@culinova/db";
import * as s from "@culinova/db/schema";
import { and, asc, desc, eq, isNull, sql } from "drizzle-orm";
import { getQuotaLimits } from "../quotas";

export interface RecipeView {
  recipeId: string;
  versionId: string;
  versionNo: number;
  versionCount: number;
  /** Numéro de la version active de la recette (celle affichée par défaut). */
  currentVersionNo: number;
  /** Toutes les versions, de la plus récente à la plus ancienne. */
  versions: Array<{ versionNo: number; name: string; createdAt: string; changeNote: string | null }>;
  name: string;
  description: string | null;
  servings: number;
  difficulty: "easy" | "medium" | "hard" | null;
  prepS: number;
  cookS: number;
  restS: number;
  cuisineLabel: string | null;
  fusionLabel: string | null;
  season: string[];
  equipment: string[];
  allergens: string[];
  diets: string[];
  tips: string[];
  language: string;
  createdAt: string;
  ingredients: Array<{
    id: string;
    label: string;
    dimension: "mass" | "volume" | "count";
    quantity: number;
    displayQuantity: number | null;
    displayUnit: string | null;
    preparation: string | null;
    group: string | null;
    optional: boolean;
    toConfirm: boolean;
  }>;
  steps: Array<{
    id: string;
    phase: "mise_en_place" | "cooking" | "plating";
    action: string;
    ingredientIds: string[];
    temperatureC: number | null;
    durationS: number | null;
    equipment: string[];
    expectedResult: string | null;
    timer: boolean;
  }>;
  plating: {
    /** Absent des recettes générées avant l'ajout de ce champ. */
    description?: string | null;
    plate: string;
    positioning: string;
    quantities: string;
    sauce: string | null;
    garnish: string | null;
    finish: string | null;
    decoration: string | null;
  } | null;
  social: Array<{
    platform: string;
    title: string | null;
    description: string | null;
    caption: string | null;
    hashtags: string[];
  }>;
  regenerations: { used: number; limit: number | null };
  /** Génération (régénération) en cours pour cette recette. */
  pendingGenerationId: string | null;
}

export async function loadRecipeView(
  db: Database,
  recipeId: string,
  userId: string,
  /** Version à afficher ; absente = version active. */
  versionNo?: number,
): Promise<RecipeView | null> {
  const [row] = await db
    .select({ recipe: s.recipes, current: s.recipeVersions })
    .from(s.recipes)
    .innerJoin(s.recipeVersions, eq(s.recipeVersions.id, s.recipes.currentVersionId))
    .where(and(eq(s.recipes.id, recipeId), eq(s.recipes.ownerId, userId), isNull(s.recipes.deletedAt)));
  if (!row) return null;
  const { recipe, current } = row;
  const versions = await db
    .select({
      id: s.recipeVersions.id,
      versionNo: s.recipeVersions.versionNo,
      name: s.recipeVersions.name,
      createdAt: s.recipeVersions.createdAt,
      changeNote: s.recipeVersions.changeNote,
    })
    .from(s.recipeVersions)
    .where(eq(s.recipeVersions.recipeId, recipe.id))
    .orderBy(desc(s.recipeVersions.versionNo));
  let version = current;
  if (versionNo !== undefined && versionNo !== current.versionNo) {
    const [other] = await db
      .select()
      .from(s.recipeVersions)
      .where(and(eq(s.recipeVersions.recipeId, recipe.id), eq(s.recipeVersions.versionNo, versionNo)));
    if (!other) return null;
    version = other;
  }

  const [ingredients, steps, social, [count], [usage], limits, [pending]] = await Promise.all([
    db
      .select({ line: s.recipeIngredients, status: s.ingredients.status })
      .from(s.recipeIngredients)
      .leftJoin(s.ingredients, eq(s.ingredients.id, s.recipeIngredients.ingredientId))
      .where(eq(s.recipeIngredients.recipeVersionId, version.id))
      .orderBy(asc(s.recipeIngredients.sortOrder)),
    db
      .select()
      .from(s.recipeSteps)
      .where(eq(s.recipeSteps.recipeVersionId, version.id))
      .orderBy(asc(s.recipeSteps.sortOrder)),
    db.select().from(s.socialContents).where(eq(s.socialContents.recipeVersionId, version.id)),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(s.recipeVersions)
      .where(eq(s.recipeVersions.recipeId, recipe.id)),
    db
      .select({ count: s.usageCounters.count })
      .from(s.usageCounters)
      .where(
        and(
          eq(s.usageCounters.subjectType, "recipe"),
          eq(s.usageCounters.subjectId, recipe.id),
          eq(s.usageCounters.metric, "regenerations"),
        ),
      ),
    getQuotaLimits(db, userId),
    db
      .select({ id: s.aiGenerations.id })
      .from(s.aiGenerations)
      .where(
        and(
          eq(s.aiGenerations.recipeId, recipe.id),
          eq(s.aiGenerations.kind, "regeneration"),
          sql`${s.aiGenerations.status} in ('queued', 'running')`,
        ),
      ),
  ]);

  const order = ["generic", "instagram", "tiktok", "pinterest", "linkedin"];
  return {
    recipeId: recipe.id,
    versionId: version.id,
    versionNo: version.versionNo,
    versionCount: count?.n ?? 1,
    currentVersionNo: current.versionNo,
    versions: versions.map((v) => ({
      versionNo: v.versionNo,
      name: v.name,
      createdAt: v.createdAt.toISOString(),
      changeNote: v.changeNote,
    })),
    name: version.name,
    description: version.description,
    servings: version.servings,
    difficulty: version.difficulty,
    prepS: version.prepS ?? 0,
    cookS: version.cookS ?? 0,
    restS: version.restS ?? 0,
    cuisineLabel: version.cuisineLabel,
    fusionLabel: version.fusionLabel,
    season: version.season,
    equipment: version.equipment,
    allergens: version.allergens,
    diets: version.diets,
    tips: version.tips,
    language: recipe.originalLanguage,
    createdAt: version.createdAt.toISOString(),
    ingredients: ingredients.map(({ line, status }) => {
      const dimension = line.quantityG !== null ? "mass" : line.quantityMl !== null ? "volume" : "count";
      return {
        id: line.id,
        label: line.label,
        dimension,
        quantity: Number(line.quantityG ?? line.quantityMl ?? line.quantityPiece ?? 0),
        displayQuantity: line.displayQuantity === null ? null : Number(line.displayQuantity),
        displayUnit: line.displayUnit,
        preparation: line.preparation,
        group: line.groupLabel,
        optional: line.optional,
        toConfirm: status === "to_confirm",
      };
    }),
    steps: steps.map((step) => ({
      id: step.id,
      phase: step.phase,
      action: step.action,
      ingredientIds: step.ingredientRefs,
      temperatureC: step.temperatureC,
      durationS: step.durationS,
      equipment: step.equipment,
      expectedResult: step.expectedResult,
      timer: step.timer,
    })),
    plating: (version.plating as RecipeView["plating"]) ?? null,
    social: social
      .map((row) => ({
        platform: row.platform,
        title: row.title,
        description: row.description,
        caption: row.caption,
        hashtags: row.hashtags,
      }))
      .sort((a, b) => order.indexOf(a.platform) - order.indexOf(b.platform)),
    regenerations: { used: usage?.count ?? 0, limit: limits.regenerations },
    pendingGenerationId: pending?.id ?? null,
  };
}

/** Liste des recettes de la personne (les plus récentes d'abord). */
export async function listRecipes(db: Database, userId: string) {
  return db
    .select({
      id: s.recipes.id,
      name: s.recipeVersions.name,
      servings: s.recipeVersions.servings,
      cuisineLabel: s.recipeVersions.cuisineLabel,
      prepS: s.recipeVersions.prepS,
      cookS: s.recipeVersions.cookS,
      updatedAt: s.recipeVersions.createdAt,
    })
    .from(s.recipes)
    .innerJoin(s.recipeVersions, eq(s.recipeVersions.id, s.recipes.currentVersionId))
    .where(and(eq(s.recipes.ownerId, userId), isNull(s.recipes.deletedAt)))
    .orderBy(sql`${s.recipeVersions.createdAt} desc`);
}
