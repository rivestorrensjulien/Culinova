"use server";

import { createLlmAdapter } from "@culinova/ai";
import * as s from "@culinova/db/schema";
import { and, eq } from "drizzle-orm";
import { getLocale } from "next-intl/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { audit } from "../audit";
import {
  type AutoEstimateResult,
  type EstimateResult,
  estimateMissingPrices,
  estimatePrices,
} from "../costing/estimate";
import { confirmIngredient } from "../costing/ingredients";
import { type DecideResult, decideInvoiceLine } from "../costing/invoices";
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

/** Propose des prix estimés par l'IA (rien n'est enregistré sans validation). */
export async function estimatePricesAction(ingredientIds: string[]): Promise<EstimateResult> {
  const session = await currentUser();
  const ids = ingredientIds.filter((id) => uuid.safeParse(id).success);
  return estimatePrices(
    getDb(),
    createLlmAdapter(process.env, { effort: "low" }),
    session.user.id,
    ids,
    await getLocale(),
  );
}

/**
 * Estimation automatique des prix manquants d'une recette (version active et bases maison),
 * lancée à l'ouverture d'une recette qui en a encore. Prix enregistrés « à confirmer ».
 */
export async function estimateRecipePricesAction(recipeId: string): Promise<AutoEstimateResult> {
  const session = await currentUser();
  if (!uuid.safeParse(recipeId).success) return { ok: false, reason: "failed" };
  const db = getDb();
  const [recipe] = await db
    .select({ versionId: s.recipes.currentVersionId })
    .from(s.recipes)
    .where(and(eq(s.recipes.id, recipeId), eq(s.recipes.ownerId, session.user.id)));
  if (!recipe?.versionId) return { ok: false, reason: "failed" };
  const result = await estimateMissingPrices(
    db,
    createLlmAdapter(process.env, { effort: "low" }),
    session.user.id,
    recipe.versionId,
    await getLocale(),
  );
  if (result.ok && result.saved > 0) revalidatePath("/app", "layout");
  return result;
}

/** Valide une ligne de facture (prix enregistré pour l'ingrédient choisi) ou l'ignore. */
export async function decideInvoiceLineAction(
  lineId: string,
  decision: { accept: boolean; ingredientId?: string; price?: string },
): Promise<DecideResult> {
  const session = await currentUser();
  if (!uuid.safeParse(lineId).success) return { ok: false, reason: "not_found" };
  const db = getDb();
  let result: DecideResult;
  if (decision.accept) {
    if (!decision.ingredientId || !uuid.safeParse(decision.ingredientId).success) {
      return { ok: false, reason: "invalid" };
    }
    result = await decideInvoiceLine(db, session.user.id, lineId, {
      accept: true,
      ingredientId: decision.ingredientId,
      price: String(decision.price ?? "").slice(0, 20),
    });
  } else {
    result = await decideInvoiceLine(db, session.user.id, lineId, { accept: false });
  }
  if (result.ok && decision.accept) revalidatePath("/app", "layout");
  return result;
}
