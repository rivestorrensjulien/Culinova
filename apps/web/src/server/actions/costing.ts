"use server";

import { getLocale } from "next-intl/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { audit } from "../audit";
import { confirmIngredient } from "../costing/ingredients";
import { type SavePriceResult, savePrice } from "../costing/prices";
import { getDb } from "../db";
import { requireUser } from "../session";

const uuid = z.uuid();

async function currentUser() {
  return requireUser(await getLocale());
}

/** Enregistre le prix d'un ingrédient ; le coût des recettes qui l'utilisent est recalculé à l'affichage. */
export async function savePriceAction(
  ingredientId: string,
  price: string,
  supplierName: string | null,
): Promise<SavePriceResult> {
  const session = await currentUser();
  if (!uuid.safeParse(ingredientId).success) return { ok: false, reason: "not_found" };
  const db = getDb();
  const result = await savePrice(db, {
    userId: session.user.id,
    ingredientId,
    price: String(price).slice(0, 20),
    supplierName: supplierName?.slice(0, 120) ?? null,
  });
  if (result.ok) {
    await audit(db, {
      actorId: session.user.id,
      action: "ingredient.price.set",
      entity: "ingredient",
      entityId: ingredientId,
      after: { price: result.price },
    });
    revalidatePath("/app", "layout");
  }
  return result;
}

export async function confirmIngredientAction(ingredientId: string): Promise<boolean> {
  const session = await currentUser();
  if (!uuid.safeParse(ingredientId).success) return false;
  const ok = await confirmIngredient(getDb(), session.user.id, ingredientId);
  if (ok) revalidatePath("/app", "layout");
  return ok;
}
