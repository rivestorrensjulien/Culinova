/**
 * Menus : plusieurs recettes (entrée, plat, dessert…) servies ensemble, chacune pour
 * son nombre de couverts, avec le coût matière total et par convive.
 */
import type { Database } from "@culinova/db";
import * as s from "@culinova/db/schema";
import { and, asc, desc, eq, isNull, sql } from "drizzle-orm";
import { computeRecipeCost } from "../costing/recipe-cost";
import { createShoppingList } from "./shopping";

export const COURSES = ["starter", "main", "dessert", "drink", "other"] as const;
export type Course = (typeof COURSES)[number];

/** Moment du repas → service proposé par défaut. */
const COURSE_OF_MOMENT: Record<string, Course> = {
  starter: "starter",
  main: "main",
  dessert: "dessert",
  sweet_bite: "dessert",
  savory_bite: "starter",
};

export interface MenuInput {
  name: string;
  guests: number;
  eventDate: Date | null;
}

async function ownedMenu(db: Database, userId: string, menuId: string) {
  const [menu] = await db
    .select()
    .from(s.menus)
    .where(and(eq(s.menus.id, menuId), eq(s.menus.ownerId, userId), isNull(s.menus.deletedAt)));
  return menu ?? null;
}

export async function listMenus(db: Database, userId: string) {
  const menus = await db
    .select({
      id: s.menus.id,
      name: s.menus.name,
      guests: s.menus.guests,
      eventDate: s.menus.eventDate,
      itemCount: sql<number>`(select count(*) from ${s.menuItems} where ${s.menuItems.menuId} = ${s.menus.id})::int`,
    })
    .from(s.menus)
    .where(and(eq(s.menus.ownerId, userId), isNull(s.menus.deletedAt)))
    .orderBy(desc(s.menus.createdAt));
  return menus.map((m) => ({ ...m, eventDate: m.eventDate?.toISOString() ?? null }));
}

export async function createMenu(db: Database, userId: string, input: MenuInput): Promise<string> {
  const [menu] = await db
    .insert(s.menus)
    .values({ ownerId: userId, name: input.name, guests: input.guests, eventDate: input.eventDate })
    .returning({ id: s.menus.id });
  return menu!.id;
}

export async function updateMenu(
  db: Database,
  userId: string,
  menuId: string,
  input: MenuInput,
): Promise<boolean> {
  const updated = await db
    .update(s.menus)
    .set({ name: input.name, guests: input.guests, eventDate: input.eventDate })
    .where(and(eq(s.menus.id, menuId), eq(s.menus.ownerId, userId), isNull(s.menus.deletedAt)))
    .returning({ id: s.menus.id });
  return updated.length > 0;
}

export async function deleteMenu(db: Database, userId: string, menuId: string): Promise<boolean> {
  const deleted = await db
    .delete(s.menus)
    .where(and(eq(s.menus.id, menuId), eq(s.menus.ownerId, userId)))
    .returning({ id: s.menus.id });
  return deleted.length > 0;
}

/** Ajoute une recette (un plat de la personne) au menu, pour le nombre de couverts du menu par défaut. */
export async function addMenuItem(
  db: Database,
  userId: string,
  menuId: string,
  input: { recipeId: string; course?: Course; servings?: number },
): Promise<boolean> {
  const menu = await ownedMenu(db, userId, menuId);
  if (!menu) return false;
  const [recipe] = await db
    .select({ id: s.recipes.id, moment: s.mealMoments.code })
    .from(s.recipes)
    .innerJoin(s.recipeVersions, eq(s.recipeVersions.id, s.recipes.currentVersionId))
    .leftJoin(s.mealMoments, eq(s.mealMoments.id, s.recipeVersions.momentId))
    .where(
      and(
        eq(s.recipes.id, input.recipeId),
        eq(s.recipes.ownerId, userId),
        eq(s.recipes.kind, "dish"),
        isNull(s.recipes.deletedAt),
      ),
    );
  if (!recipe) return false;
  const [last] = await db
    .select({ max: sql<number>`coalesce(max(${s.menuItems.sortOrder}), -1)::int` })
    .from(s.menuItems)
    .where(eq(s.menuItems.menuId, menuId));
  await db.insert(s.menuItems).values({
    menuId,
    recipeId: recipe.id,
    course: input.course ?? COURSE_OF_MOMENT[recipe.moment ?? ""] ?? "other",
    servings: input.servings ?? menu.guests,
    sortOrder: (last?.max ?? -1) + 1,
  });
  return true;
}

async function ownedItem(db: Database, userId: string, itemId: string) {
  const [item] = await db
    .select({ id: s.menuItems.id })
    .from(s.menuItems)
    .innerJoin(s.menus, eq(s.menus.id, s.menuItems.menuId))
    .where(and(eq(s.menuItems.id, itemId), eq(s.menus.ownerId, userId)));
  return item ?? null;
}

export async function updateMenuItem(
  db: Database,
  userId: string,
  itemId: string,
  input: { course: Course; servings: number },
): Promise<boolean> {
  if (!(await ownedItem(db, userId, itemId))) return false;
  await db
    .update(s.menuItems)
    .set({ course: input.course, servings: input.servings })
    .where(eq(s.menuItems.id, itemId));
  return true;
}

export async function removeMenuItem(db: Database, userId: string, itemId: string): Promise<boolean> {
  if (!(await ownedItem(db, userId, itemId))) return false;
  await db.delete(s.menuItems).where(eq(s.menuItems.id, itemId));
  return true;
}

export interface MenuView {
  id: string;
  name: string;
  guests: number;
  eventDate: string | null;
  items: Array<{
    id: string;
    recipeId: string;
    name: string;
    course: Course;
    servings: number;
    /** Coût matière pour le nombre de couverts du plat (null : aucun prix connu). */
    costCents: number | null;
    complete: boolean;
  }>;
  totalCents: number;
  perGuestCents: number;
  /** Faux si un plat n'est pas entièrement chiffré. */
  complete: boolean;
  /** Plats que la personne peut ajouter. */
  available: Array<{ id: string; name: string }>;
}

export async function loadMenu(db: Database, userId: string, menuId: string): Promise<MenuView | null> {
  const menu = await ownedMenu(db, userId, menuId);
  if (!menu) return null;
  const rows = await db
    .select({
      id: s.menuItems.id,
      recipeId: s.menuItems.recipeId,
      course: s.menuItems.course,
      servings: s.menuItems.servings,
      name: s.recipeVersions.name,
      versionId: s.recipeVersions.id,
      recipeServings: s.recipeVersions.servings,
    })
    .from(s.menuItems)
    .innerJoin(s.recipes, eq(s.recipes.id, s.menuItems.recipeId))
    .innerJoin(s.recipeVersions, eq(s.recipeVersions.id, s.recipes.currentVersionId))
    .where(and(eq(s.menuItems.menuId, menuId), isNull(s.recipes.deletedAt)))
    .orderBy(asc(s.menuItems.sortOrder));

  const items: MenuView["items"] = [];
  for (const row of rows) {
    const cost = await computeRecipeCost(db, userId, row.versionId, Number(row.recipeServings));
    const scaled = Math.round((cost.totalCents * row.servings) / Math.max(1, Number(row.recipeServings)));
    items.push({
      id: row.id,
      recipeId: row.recipeId,
      name: row.name,
      course: row.course,
      servings: row.servings,
      costCents: cost.pricedCount === 0 ? null : scaled,
      complete: cost.pricedCount > 0 && cost.missing.length === 0,
    });
  }
  items.sort((a, b) => COURSES.indexOf(a.course) - COURSES.indexOf(b.course));
  const totalCents = items.reduce((sum, item) => sum + (item.costCents ?? 0), 0);

  const used = new Set(rows.map((r) => r.recipeId));
  const dishes = await db
    .select({ id: s.recipes.id, name: s.recipeVersions.name })
    .from(s.recipes)
    .innerJoin(s.recipeVersions, eq(s.recipeVersions.id, s.recipes.currentVersionId))
    .where(and(eq(s.recipes.ownerId, userId), eq(s.recipes.kind, "dish"), isNull(s.recipes.deletedAt)))
    .orderBy(asc(s.recipeVersions.name));

  return {
    id: menu.id,
    name: menu.name,
    guests: menu.guests,
    eventDate: menu.eventDate?.toISOString() ?? null,
    items,
    totalCents,
    perGuestCents: Math.round(totalCents / Math.max(1, menu.guests)),
    complete: items.length > 0 && items.every((i) => i.complete),
    available: dishes.filter((d) => !used.has(d.id)),
  };
}

/** Liste de courses de tout le menu (chaque plat pour son nombre de couverts). */
export async function shoppingListForMenu(
  db: Database,
  userId: string,
  menuId: string,
): Promise<string | null> {
  const menu = await ownedMenu(db, userId, menuId);
  if (!menu) return null;
  const items = await db
    .select({ recipeId: s.menuItems.recipeId, servings: s.menuItems.servings })
    .from(s.menuItems)
    .where(eq(s.menuItems.menuId, menuId));
  return createShoppingList(db, userId, { name: menu.name, source: "menu", entries: items });
}
