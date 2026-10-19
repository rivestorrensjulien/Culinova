/**
 * Vitrine de la page d'accueil : photos de recettes choisies par un administrateur
 * (ses propres recettes). Seules ces photos sont servies sans connexion.
 */
import type { Database } from "@culinova/db";
import * as s from "@culinova/db/schema";
import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { pricingSheet } from "@culinova/core";
import { audit } from "./audit";
import { loadRecipeView } from "./generation/view";
import { amountText, stepPlainText } from "./recipe-text";

export const SHOWCASE_MAX = 6;

async function readIds(db: Database): Promise<string[]> {
  const [row] = await db
    .select({ value: s.siteSettings.value })
    .from(s.siteSettings)
    .where(eq(s.siteSettings.key, s.SETTING_KEYS.homeShowcase));
  return Array.isArray(row?.value)
    ? (row.value as unknown[]).filter((v): v is string => typeof v === "string")
    : [];
}

export async function isInShowcase(db: Database, recipeId: string): Promise<boolean> {
  return (await readIds(db)).includes(recipeId);
}

/** Ajoute ou retire une recette de la vitrine (recettes de l'administrateur uniquement). */
export async function setShowcase(
  db: Database,
  adminId: string,
  recipeId: string,
  shown: boolean,
): Promise<boolean> {
  const [recipe] = await db
    .select({ id: s.recipes.id })
    .from(s.recipes)
    .innerJoin(s.users, eq(s.users.id, s.recipes.ownerId))
    .where(and(eq(s.recipes.id, recipeId), eq(s.recipes.ownerId, adminId), eq(s.users.role, "admin")));
  if (!recipe) return false;
  const ids = (await readIds(db)).filter((id) => id !== recipeId);
  // La plus récente en premier ; au-delà du maximum, les plus anciennes sortent.
  const next = (shown ? [recipeId, ...ids] : ids).slice(0, SHOWCASE_MAX);
  await db
    .insert(s.siteSettings)
    .values({ key: s.SETTING_KEYS.homeShowcase, value: next })
    .onConflictDoUpdate({ target: s.siteSettings.key, set: { value: next, updatedAt: new Date() } });
  await audit(db, {
    actorId: adminId,
    action: shown ? "showcase.add" : "showcase.remove",
    entity: "recipe",
    entityId: recipeId,
  });
  return true;
}

export interface ShowcaseItem {
  recipeId: string;
  name: string;
  /** Recadrage 4:5 de la photo principale de la version active. */
  imageId: string;
  storageKey: string;
}

/** Photos de la vitrine, dans l'ordre choisi, pour les recettes encore présentes et illustrées. */
export async function getShowcase(db: Database): Promise<ShowcaseItem[]> {
  const ids = await readIds(db);
  if (ids.length === 0) return [];
  const source = alias(s.recipeImages, "source");
  const rows = await db
    .select({
      recipeId: s.recipes.id,
      name: s.recipeVersions.name,
      imageId: s.recipeImages.id,
      storageKey: s.recipeImages.storageKey,
    })
    .from(s.recipes)
    .innerJoin(s.users, eq(s.users.id, s.recipes.ownerId))
    .innerJoin(s.recipeVersions, eq(s.recipeVersions.id, s.recipes.currentVersionId))
    .innerJoin(source, and(eq(source.recipeVersionId, s.recipeVersions.id), eq(source.isPrimary, true)))
    .innerJoin(s.recipeImages, eq(s.recipeImages.sourceImageId, source.id))
    .where(
      and(
        inArray(s.recipes.id, ids),
        eq(s.users.role, "admin"),
        isNull(s.recipes.deletedAt),
        eq(s.recipeImages.format, "4:5"),
        eq(s.recipeImages.status, "ready"),
      ),
    )
    .orderBy(desc(s.recipeImages.createdAt));
  return ids.flatMap((id) => {
    const row = rows.find((r) => r.recipeId === id && r.storageKey);
    return row?.storageKey ? [{ ...row, storageKey: row.storageKey }] : [];
  });
}

export interface ShowcaseStory {
  recipeId: string;
  name: string;
  cuisine: string | null;
  /** Idée de départ saisie dans l'assistant de création (ou, à défaut, la description). */
  idea: string | null;
  servings: number;
  totalS: number;
  ingredients: Array<{ label: string; amount: string }>;
  /** Premières étapes, quantités écrites entre parenthèses. */
  steps: string[];
  /** Nombre total d'étapes de la recette. */
  stepCount: number;
  costPerPortionCents: number | null;
  suggestedPriceTtcCents: number | null;
  imageId: string;
  caption: string | null;
  hashtags: string[];
}

/**
 * Une recette de la vitrine racontée de bout en bout sur la page d'accueil : idée,
 * recette pesée, chiffrage, photo et texte Instagram, avec les vraies données.
 */
export async function getShowcaseStory(db: Database, item: ShowcaseItem): Promise<ShowcaseStory | null> {
  const [recipe] = await db
    .select({ ownerId: s.recipes.ownerId })
    .from(s.recipes)
    .where(eq(s.recipes.id, item.recipeId));
  if (!recipe) return null;
  const view = await loadRecipeView(db, item.recipeId, recipe.ownerId);
  if (!view) return null;
  const [draft] = await db
    .select({ state: s.recipeDrafts.state })
    .from(s.recipeDrafts)
    .where(eq(s.recipeDrafts.recipeId, item.recipeId))
    .limit(1);
  const input = typeof draft?.state.input === "string" ? draft.state.input.trim() : "";

  const { settings, appliances, pricing } = view.pricing;
  const sheet =
    view.cost.pricedCount === 0
      ? null
      : pricingSheet({
          materialCents: view.cost.totalCents,
          servings: Math.max(1, Math.round(view.servings)),
          laborSeconds: pricing?.laborSeconds ?? view.prepS,
          hourlyRateCents: settings.hourlyRateCents,
          energy: (pricing?.energyUses ?? []).flatMap((use) => {
            const appliance = appliances.find((a) => a.id === use.applianceId);
            return appliance ? [{ powerW: appliance.powerW, seconds: use.seconds }] : [];
          }),
          kwhPriceCents: settings.kwhPriceCents,
          coefficient: pricing?.coefficient ?? settings.coefficient,
          vatRate: pricing?.vatRate ?? settings.vatRate,
          sellingPriceTtcCents: null,
        });
  const instagram = view.social.find((c) => c.platform === "instagram");

  return {
    recipeId: item.recipeId,
    name: view.name,
    cuisine: view.cuisineLabel,
    idea: input || view.description,
    servings: view.servings,
    totalS: view.prepS + view.cookS + view.restS,
    ingredients: view.ingredients.map((i) => ({ label: i.label, amount: amountText(i) })),
    steps: view.steps.slice(0, 3).map((step) => stepPlainText(view, step.action)),
    stepCount: view.steps.length,
    costPerPortionCents: sheet ? sheet.perPortion.totalCents : null,
    suggestedPriceTtcCents: sheet ? sheet.suggested.priceInclTaxCents : null,
    imageId: item.imageId,
    caption: instagram?.caption ?? null,
    hashtags: (instagram?.hashtags ?? []).slice(0, 5),
  };
}
