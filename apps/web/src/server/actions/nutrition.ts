"use server";

import { createLlmAdapter } from "@culinova/ai";
import { getLocale } from "next-intl/server";
import { z } from "zod";
import { audit } from "../audit";
import { getDb } from "../db";
import {
  type MatchResult,
  proposeNutritionMatches,
  recipeIngredientIds,
  searchFoods,
  setNutritionLink,
  validateNutritionLinks,
} from "../nutrition/match";
import { requireUser } from "../session";

const uuid = z.uuid();

async function currentUser() {
  return requireUser(await getLocale());
}

/** L'IA propose une correspondance Ciqual (USDA en complément) pour chaque ingrédient sans correspondance. */
export async function computeNutritionAction(recipeId: string): Promise<MatchResult> {
  const session = await currentUser();
  if (!uuid.safeParse(recipeId).success) return { ok: false, reason: "empty" };
  const db = getDb();
  const ids = await recipeIngredientIds(db, session.user.id, recipeId);
  return proposeNutritionMatches(db, createLlmAdapter(process.env, { effort: "low" }), session.user.id, ids, {
    languageCode: await getLocale(),
    usdaApiKey: process.env.USDA_FDC_API_KEY || undefined,
  });
}

export async function searchFoodsAction(query: string) {
  await currentUser();
  const text = String(query ?? "").slice(0, 80);
  if (text.trim().length < 2) return [];
  return searchFoods(getDb(), text, await getLocale());
}

/** Correspondance choisie par la personne (foodId null : ingrédient ignoré dans le calcul). */
export async function setNutritionLinkAction(ingredientId: string, foodId: string | null): Promise<boolean> {
  const session = await currentUser();
  if (!uuid.safeParse(ingredientId).success) return false;
  if (foodId !== null && !uuid.safeParse(foodId).success) return false;
  const db = getDb();
  const ok = await setNutritionLink(db, session.user.id, ingredientId, foodId);
  if (ok) {
    await audit(db, {
      actorId: session.user.id,
      action: "ingredient.nutrition.set",
      entity: "ingredient",
      entityId: ingredientId,
      after: { foodId },
    });
  }
  return ok;
}

/** Valide toutes les correspondances proposées pour les ingrédients de la recette. */
export async function validateNutritionAction(recipeId: string): Promise<number> {
  const session = await currentUser();
  if (!uuid.safeParse(recipeId).success) return 0;
  const db = getDb();
  const ids = await recipeIngredientIds(db, session.user.id, recipeId);
  return validateNutritionLinks(db, session.user.id, ids);
}
