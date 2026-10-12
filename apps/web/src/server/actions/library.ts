"use server";

import { getLocale } from "next-intl/server";
import { z } from "zod";
import { getDb } from "../db";
import { commandIndex, toggleFavorite } from "../library";
import { requireUser } from "../session";

/** Ajoute ou retire une recette des favoris ; renvoie le nouvel état (null : recette introuvable). */
export async function toggleFavoriteAction(recipeId: string): Promise<boolean | null> {
  const session = await requireUser(await getLocale());
  if (!z.uuid().safeParse(recipeId).success) return null;
  return toggleFavorite(getDb(), session.user.id, recipeId);
}

/** Recettes et bases proposées par le raccourci Ctrl+K. */
export async function commandIndexAction() {
  const session = await requireUser(await getLocale());
  return commandIndex(getDb(), session.user.id);
}
