/** Données d'affichage d'une recette (version active, ou une version précédente), prêtes pour l'interface. */
import { looksStoreBought } from "@culinova/core";
import type { Database } from "@culinova/db";
import * as s from "@culinova/db/schema";
import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { loadPricingContext, type PricingContext } from "../costing/pricing";
import { computeRecipeCost, type RecipeCost } from "../costing/recipe-cost";
import { computeRecipeNutrition, type NutritionView } from "../nutrition/recipe-nutrition";
import { imagesAvailable } from "../images/storage";
import { isFavorite } from "../library";
import { getMonthlyUsage, getQuotaLimits } from "../quotas";

/** Préparation de « Mes bases » utilisée par une ligne d'ingrédient. */
export interface HomemadeBase {
  /** Identifiant de la recette de la base (page à part). */
  recipeId: string;
  name: string;
  /** Poids produit par la recette de la base, en grammes. */
  yieldG: number;
  prepS: number;
  cookS: number;
  restS: number;
}

export interface RecipeView {
  recipeId: string;
  /** « dish » pour un plat, « base » pour une préparation de « Mes bases ». */
  kind: "dish" | "base";
  /** Rendement et utilisations d'une base (null pour un plat). */
  baseInfo: {
    yieldG: number;
    yieldDisplayQuantity: number | null;
    yieldDisplayUnit: string | null;
    shelfLifeH: number | null;
    usedIn: Array<{ recipeId: string; name: string }>;
  } | null;
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
    /** Produit habituellement acheté tout prêt, réalisable maison. */
    storeBought: boolean;
    /** Préparation faite maison qui remplace le produit acheté, le cas échéant. */
    base: HomemadeBase | null;
    /** Génération de la recette maison en cours pour cette ligne. */
    pendingBaseGenerationId: string | null;
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
  /** Coût matière calculé avec les prix actuels (pour le nombre de personnes de la version). */
  cost: RecipeCost;
  /** Réglages de chiffrage du compte et paramètres de prix de la recette. */
  pricing: PricingContext;
  /** Valeurs nutritionnelles (par portion et pour 100 g) et correspondances avec la table Ciqual. */
  nutrition: NutritionView;
  /** Photo de la version (image HD et ses 4 recadrages), génération en cours et crédits d'images. */
  images: RecipeImages;
  /** Recette marquée en favori par la personne. */
  favorite: boolean;
}

export type ImageFormatName = "1:1" | "4:5" | "9:16" | "16:9";

export interface RecipeImages {
  current: {
    id: string;
    prompt: string | null;
    formats: Array<{ format: ImageFormatName; id: string; width: number; height: number }>;
  } | null;
  pendingGenerationId: string | null;
  quota: { used: number; limit: number | null };
  /** Faux si le fournisseur d'images ou le stockage n'est pas configuré. */
  available: boolean;
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

  const [ingredients, steps, social, [count], [usage], limits, [pending], cost] = await Promise.all([
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
          inArray(s.aiGenerations.kind, ["regeneration", "edit"]),
          sql`${s.aiGenerations.status} in ('queued', 'running')`,
        ),
      ),
    computeRecipeCost(db, userId, version.id, version.servings),
  ]);
  const pricing = await loadPricingContext(db, userId, recipe.id, version.id);
  const [homemade, pendingBases, baseInfo] = await Promise.all([
    homemadeBases(
      db,
      userId,
      ingredients.map(({ line }) => line.baseRecipeId),
    ),
    pendingBaseGenerations(
      db,
      ingredients.map(({ line }) => line.id),
    ),
    recipe.kind === "base" ? loadBaseInfo(db, userId, recipe.id) : null,
  ]);
  const favorite = await isFavorite(db, userId, recipe.id);
  const images = await loadRecipeImages(db, userId, recipe.id, version.id, limits.images);
  const nutrition = await computeRecipeNutrition(db, userId, version.id, version.servings, {
    language: recipe.originalLanguage,
    yieldG: baseInfo?.yieldG ?? null,
  });

  const order = ["generic", "instagram", "tiktok", "pinterest", "linkedin"];
  return {
    recipeId: recipe.id,
    kind: recipe.kind,
    baseInfo,
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
        // Recettes anciennes (non renseigné) : repérage par le nom.
        storeBought: line.storeBought ?? looksStoreBought(line.label),
        base: line.baseRecipeId ? (homemade.get(line.baseRecipeId) ?? null) : null,
        pendingBaseGenerationId: pendingBases.get(line.id) ?? null,
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
    cost,
    pricing,
    nutrition,
    images,
    favorite,
  };
}

/** Photo principale de la version et ses recadrages ; génération de photo en cours. */
async function loadRecipeImages(
  db: Database,
  userId: string,
  recipeId: string,
  versionId: string,
  limit: number | null,
): Promise<RecipeImages> {
  const [rows, [pending], usage] = await Promise.all([
    db
      .select()
      .from(s.recipeImages)
      .where(and(eq(s.recipeImages.recipeVersionId, versionId), eq(s.recipeImages.status, "ready"))),
    db
      .select({ id: s.aiGenerations.id })
      .from(s.aiGenerations)
      .where(
        and(
          eq(s.aiGenerations.recipeId, recipeId),
          eq(s.aiGenerations.kind, "image"),
          inArray(s.aiGenerations.status, ["queued", "running"]),
        ),
      ),
    getMonthlyUsage(db, userId),
  ]);
  const source = rows.find((row) => row.format === "source" && row.isPrimary) ?? null;
  const order: ImageFormatName[] = ["4:5", "1:1", "9:16", "16:9"];
  return {
    current: source
      ? {
          id: source.id,
          prompt: source.prompt,
          formats: rows
            .filter((row) => row.sourceImageId === source.id && row.format !== "source")
            .map((row) => ({
              format: row.format as ImageFormatName,
              id: row.id,
              width: row.width ?? 0,
              height: row.height ?? 0,
            }))
            .sort((a, b) => order.indexOf(a.format) - order.indexOf(b.format)),
        }
      : null,
    pendingGenerationId: pending?.id ?? null,
    quota: { used: usage.used.images, limit },
    available: imagesAvailable(),
  };
}

/** Bases faites maison utilisées par les lignes, avec leur version active. */
async function homemadeBases(
  db: Database,
  userId: string,
  ids: Array<string | null>,
): Promise<Map<string, HomemadeBase>> {
  const wanted = [...new Set(ids.filter((id): id is string => Boolean(id)))];
  if (wanted.length === 0) return new Map();
  const rows = await db
    .select({
      id: s.baseRecipes.id,
      recipeId: s.recipes.id,
      yieldG: s.baseRecipes.yieldG,
      name: s.recipeVersions.name,
      prepS: s.recipeVersions.prepS,
      cookS: s.recipeVersions.cookS,
      restS: s.recipeVersions.restS,
    })
    .from(s.baseRecipes)
    .innerJoin(s.recipes, eq(s.recipes.id, s.baseRecipes.recipeId))
    .innerJoin(s.recipeVersions, eq(s.recipeVersions.id, s.recipes.currentVersionId))
    .where(
      and(inArray(s.baseRecipes.id, wanted), eq(s.recipes.ownerId, userId), isNull(s.recipes.deletedAt)),
    );
  return new Map(
    rows.map((row) => [
      row.id,
      {
        recipeId: row.recipeId,
        name: row.name,
        yieldG: row.yieldG,
        prepS: row.prepS ?? 0,
        cookS: row.cookS ?? 0,
        restS: row.restS ?? 0,
      },
    ]),
  );
}

/** Générations de bases en cours, par ligne d'ingrédient. */
async function pendingBaseGenerations(db: Database, lineIds: string[]): Promise<Map<string, string>> {
  if (lineIds.length === 0) return new Map();
  const rows = await db
    .select({ id: s.aiGenerations.id, inputRef: s.aiGenerations.inputRef })
    .from(s.aiGenerations)
    .where(
      and(
        eq(s.aiGenerations.kind, "base"),
        inArray(
          s.aiGenerations.inputRef,
          lineIds.map((id) => `line:${id}`),
        ),
        inArray(s.aiGenerations.status, ["queued", "running"]),
      ),
    );
  return new Map(rows.map((row) => [row.inputRef!.slice(5), row.id]));
}

/** Rendement d'une base et recettes qui l'utilisent (version active). */
async function loadBaseInfo(db: Database, userId: string, recipeId: string): Promise<RecipeView["baseInfo"]> {
  const [base] = await db.select().from(s.baseRecipes).where(eq(s.baseRecipes.recipeId, recipeId));
  if (!base) return null;
  const usedIn = await db
    .selectDistinct({ recipeId: s.recipes.id, name: s.recipeVersions.name })
    .from(s.recipeIngredients)
    .innerJoin(s.recipeVersions, eq(s.recipeVersions.id, s.recipeIngredients.recipeVersionId))
    .innerJoin(s.recipes, eq(s.recipes.currentVersionId, s.recipeVersions.id))
    .where(
      and(
        eq(s.recipeIngredients.baseRecipeId, base.id),
        eq(s.recipes.ownerId, userId),
        isNull(s.recipes.deletedAt),
      ),
    );
  return {
    yieldG: base.yieldG,
    yieldDisplayQuantity: base.yieldDisplayQuantity === null ? null : Number(base.yieldDisplayQuantity),
    yieldDisplayUnit: base.yieldDisplayUnit,
    shelfLifeH: base.shelfLifeH,
    usedIn,
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
    .where(and(eq(s.recipes.ownerId, userId), eq(s.recipes.kind, "dish"), isNull(s.recipes.deletedAt)))
    .orderBy(sql`${s.recipeVersions.createdAt} desc`);
}

/** « Mes bases » : préparations faites maison de la personne, avec les recettes qui les utilisent. */
export async function listBases(db: Database, userId: string) {
  const bases = await db
    .select({
      id: s.recipes.id,
      baseId: s.baseRecipes.id,
      name: s.recipeVersions.name,
      yieldG: s.baseRecipes.yieldG,
      yieldDisplayQuantity: s.baseRecipes.yieldDisplayQuantity,
      yieldDisplayUnit: s.baseRecipes.yieldDisplayUnit,
      prepS: s.recipeVersions.prepS,
      cookS: s.recipeVersions.cookS,
      restS: s.recipeVersions.restS,
      createdAt: s.recipeVersions.createdAt,
    })
    .from(s.recipes)
    .innerJoin(s.baseRecipes, eq(s.baseRecipes.recipeId, s.recipes.id))
    .innerJoin(s.recipeVersions, eq(s.recipeVersions.id, s.recipes.currentVersionId))
    .where(and(eq(s.recipes.ownerId, userId), eq(s.recipes.kind, "base"), isNull(s.recipes.deletedAt)))
    .orderBy(sql`${s.recipeVersions.createdAt} desc`);
  if (bases.length === 0) return [];
  const uses = await db
    .selectDistinct({
      baseId: s.recipeIngredients.baseRecipeId,
      recipeId: s.recipes.id,
      name: s.recipeVersions.name,
    })
    .from(s.recipeIngredients)
    .innerJoin(s.recipeVersions, eq(s.recipeVersions.id, s.recipeIngredients.recipeVersionId))
    .innerJoin(s.recipes, eq(s.recipes.currentVersionId, s.recipeVersions.id))
    .where(
      and(
        inArray(
          s.recipeIngredients.baseRecipeId,
          bases.map((b) => b.baseId),
        ),
        eq(s.recipes.ownerId, userId),
        isNull(s.recipes.deletedAt),
      ),
    );
  return bases.map((base) => ({
    ...base,
    yieldDisplayQuantity: base.yieldDisplayQuantity === null ? null : Number(base.yieldDisplayQuantity),
    usedIn: uses.filter((u) => u.baseId === base.baseId).map((u) => ({ recipeId: u.recipeId, name: u.name })),
  }));
}
