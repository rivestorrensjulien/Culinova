/**
 * Bibliothèque : les recettes de la personne sous forme de cartes (photo, catégorie,
 * coût par portion, temps, personnes), avec les données nécessaires à la recherche
 * et aux filtres faits dans le navigateur. Favoris et index du raccourci Ctrl+K.
 */
import type { Database } from "@culinova/db";
import * as s from "@culinova/db/schema";
import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import { computeRecipeCost } from "./costing/recipe-cost";

export interface LibraryCard {
  id: string;
  name: string;
  description: string | null;
  momentCode: string | null;
  momentLabel: string | null;
  cuisineLabel: string | null;
  servings: number;
  /** Préparation + cuisson + repos, en secondes. */
  totalS: number;
  difficulty: "easy" | "medium" | "hard" | null;
  diets: string[];
  ingredients: string[];
  costPerPortionCents: number | null;
  /** Recadrage 4:5 de la photo principale, s'il existe. */
  imageId: string | null;
  favorite: boolean;
  createdAt: string;
}

export async function listLibrary(db: Database, userId: string, language = "fr"): Promise<LibraryCard[]> {
  const rows = await db
    .select({
      id: s.recipes.id,
      versionId: s.recipeVersions.id,
      name: s.recipeVersions.name,
      description: s.recipeVersions.description,
      momentCode: s.mealMoments.code,
      momentLabel: s.mealMomentTranslations.name,
      cuisineLabel: s.recipeVersions.cuisineLabel,
      servings: s.recipeVersions.servings,
      prepS: s.recipeVersions.prepS,
      cookS: s.recipeVersions.cookS,
      restS: s.recipeVersions.restS,
      difficulty: s.recipeVersions.difficulty,
      diets: s.recipeVersions.diets,
      createdAt: s.recipeVersions.createdAt,
    })
    .from(s.recipes)
    .innerJoin(s.recipeVersions, eq(s.recipeVersions.id, s.recipes.currentVersionId))
    .leftJoin(s.mealMoments, eq(s.mealMoments.id, s.recipeVersions.momentId))
    .leftJoin(
      s.mealMomentTranslations,
      and(
        eq(s.mealMomentTranslations.entityId, s.recipeVersions.momentId),
        eq(s.mealMomentTranslations.languageCode, language),
      ),
    )
    .where(and(eq(s.recipes.ownerId, userId), eq(s.recipes.kind, "dish"), isNull(s.recipes.deletedAt)))
    .orderBy(desc(s.recipeVersions.createdAt));
  if (rows.length === 0) return [];

  const versionIds = rows.map((r) => r.versionId);
  const [ingredientRows, images, favorites, costs] = await Promise.all([
    db
      .select({ versionId: s.recipeIngredients.recipeVersionId, label: s.recipeIngredients.label })
      .from(s.recipeIngredients)
      .where(inArray(s.recipeIngredients.recipeVersionId, versionIds)),
    db
      .select({
        id: s.recipeImages.id,
        versionId: s.recipeImages.recipeVersionId,
        format: s.recipeImages.format,
        sourceId: s.recipeImages.sourceImageId,
        isPrimary: s.recipeImages.isPrimary,
      })
      .from(s.recipeImages)
      .where(and(inArray(s.recipeImages.recipeVersionId, versionIds), eq(s.recipeImages.status, "ready"))),
    db.select({ recipeId: s.favorites.recipeId }).from(s.favorites).where(eq(s.favorites.userId, userId)),
    // Coût calculé à la volée (jamais stocké), comme sur la page recette.
    Promise.all(rows.map((row) => computeRecipeCost(db, userId, row.versionId, row.servings))),
  ]);

  const ingredientsOf = new Map<string, string[]>();
  for (const line of ingredientRows) {
    ingredientsOf.set(line.versionId, [...(ingredientsOf.get(line.versionId) ?? []), line.label]);
  }
  const primary = new Set(images.filter((i) => i.format === "source" && i.isPrimary).map((i) => i.id));
  const imageOf = new Map<string, string>(
    images
      .filter((i) => i.format === "4:5" && i.sourceId && primary.has(i.sourceId))
      .map((i) => [i.versionId, i.id] as const),
  );
  const favorite = new Set(favorites.map((f) => f.recipeId));

  return rows.map((row, index) => {
    const cost = costs[index]!;
    return {
      id: row.id,
      name: row.name,
      description: row.description,
      momentCode: row.momentCode,
      momentLabel: row.momentLabel,
      cuisineLabel: row.cuisineLabel,
      servings: row.servings,
      totalS: (row.prepS ?? 0) + (row.cookS ?? 0) + (row.restS ?? 0),
      difficulty: row.difficulty,
      diets: row.diets,
      ingredients: ingredientsOf.get(row.versionId) ?? [],
      costPerPortionCents: cost.pricedCount > 0 ? cost.perPortionCents : null,
      imageId: imageOf.get(row.versionId) ?? null,
      favorite: favorite.has(row.id),
      createdAt: row.createdAt.toISOString(),
    };
  });
}

/** Ajoute ou retire une recette des favoris ; renvoie le nouvel état. */
export async function toggleFavorite(
  db: Database,
  userId: string,
  recipeId: string,
): Promise<boolean | null> {
  const [recipe] = await db
    .select({ id: s.recipes.id })
    .from(s.recipes)
    .where(and(eq(s.recipes.id, recipeId), eq(s.recipes.ownerId, userId), isNull(s.recipes.deletedAt)));
  if (!recipe) return null;
  const removed = await db
    .delete(s.favorites)
    .where(and(eq(s.favorites.userId, userId), eq(s.favorites.recipeId, recipeId)))
    .returning({ recipeId: s.favorites.recipeId });
  if (removed.length > 0) return false;
  await db.insert(s.favorites).values({ userId, recipeId }).onConflictDoNothing();
  return true;
}

export async function isFavorite(db: Database, userId: string, recipeId: string): Promise<boolean> {
  const [row] = await db
    .select({ recipeId: s.favorites.recipeId })
    .from(s.favorites)
    .where(and(eq(s.favorites.userId, userId), eq(s.favorites.recipeId, recipeId)));
  return Boolean(row);
}

/** Index du raccourci Ctrl+K : recettes et bases (les pages sont ajoutées côté interface). */
export async function commandIndex(db: Database, userId: string) {
  return db
    .select({ id: s.recipes.id, name: s.recipeVersions.name, kind: s.recipes.kind })
    .from(s.recipes)
    .innerJoin(s.recipeVersions, eq(s.recipeVersions.id, s.recipes.currentVersionId))
    .where(and(eq(s.recipes.ownerId, userId), isNull(s.recipes.deletedAt)))
    .orderBy(desc(s.recipeVersions.createdAt));
}
