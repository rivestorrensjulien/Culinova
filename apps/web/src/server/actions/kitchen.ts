"use server";

import { revalidatePath } from "next/cache";
import { getLocale } from "next-intl/server";
import { z } from "zod";
import { redirect } from "@/i18n/navigation";
import { getDb } from "../db";
import {
  addMenuItem,
  COURSES,
  createMenu,
  deleteMenu,
  type MenuInput,
  removeMenuItem,
  shoppingListForMenu,
  updateMenu,
  updateMenuItem,
} from "../kitchen/menus";
import { createShoppingList, deleteShoppingList, setShoppingItemChecked } from "../kitchen/shopping";
import { requireUser } from "../session";

const uuid = z.uuid();

async function currentUser() {
  return requireUser(await getLocale());
}

export type MenuFormState = { status: "idle" } | { status: "saved" } | { status: "error" };

const menuSchema = z.object({
  name: z.string().trim().min(1).max(120),
  guests: z.coerce.number().int().min(1).max(1000),
  eventDate: z.union([z.literal(""), z.string().regex(/^\d{4}-\d{2}-\d{2}$/)]),
});

function readMenu(formData: FormData): MenuInput | null {
  const parsed = menuSchema.safeParse({
    name: formData.get("name") ?? "",
    guests: formData.get("guests") ?? "",
    eventDate: formData.get("eventDate") ?? "",
  });
  if (!parsed.success) return null;
  const { name, guests, eventDate } = parsed.data;
  return { name, guests, eventDate: eventDate ? new Date(`${eventDate}T12:00:00Z`) : null };
}

export async function createMenuAction(_prev: MenuFormState, formData: FormData): Promise<MenuFormState> {
  const session = await currentUser();
  const input = readMenu(formData);
  if (!input) return { status: "error" };
  const id = await createMenu(getDb(), session.user.id, input);
  return redirect({ href: `/app/menus/${id}`, locale: await getLocale() });
}

export async function updateMenuAction(_prev: MenuFormState, formData: FormData): Promise<MenuFormState> {
  const session = await currentUser();
  const id = uuid.safeParse(formData.get("id"));
  const input = readMenu(formData);
  if (!id.success || !input) return { status: "error" };
  const ok = await updateMenu(getDb(), session.user.id, id.data, input);
  revalidatePath("/app/menus", "layout");
  return ok ? { status: "saved" } : { status: "error" };
}

export async function deleteMenuAction(formData: FormData): Promise<void> {
  const session = await currentUser();
  const id = uuid.safeParse(formData.get("id"));
  if (id.success) await deleteMenu(getDb(), session.user.id, id.data);
  revalidatePath("/app/menus", "layout");
  return redirect({ href: "/app/menus", locale: await getLocale() });
}

export async function addMenuItemAction(formData: FormData): Promise<void> {
  const session = await currentUser();
  const menuId = uuid.safeParse(formData.get("menuId"));
  const recipeId = uuid.safeParse(formData.get("recipeId"));
  if (menuId.success && recipeId.success) {
    await addMenuItem(getDb(), session.user.id, menuId.data, { recipeId: recipeId.data });
  }
  revalidatePath("/app/menus", "layout");
}

const itemSchema = z.object({
  itemId: uuid,
  course: z.enum(COURSES),
  servings: z.coerce.number().int().min(1).max(1000),
});

export async function updateMenuItemAction(formData: FormData): Promise<void> {
  const session = await currentUser();
  const parsed = itemSchema.safeParse({
    itemId: formData.get("itemId"),
    course: formData.get("course"),
    servings: formData.get("servings"),
  });
  if (parsed.success) {
    await updateMenuItem(getDb(), session.user.id, parsed.data.itemId, {
      course: parsed.data.course,
      servings: parsed.data.servings,
    });
  }
  revalidatePath("/app/menus", "layout");
}

export async function removeMenuItemAction(formData: FormData): Promise<void> {
  const session = await currentUser();
  const itemId = uuid.safeParse(formData.get("itemId"));
  if (itemId.success) await removeMenuItem(getDb(), session.user.id, itemId.data);
  revalidatePath("/app/menus", "layout");
}

/** Liste de courses de tout le menu, puis ouverture de la liste. */
export async function menuShoppingListAction(formData: FormData): Promise<void> {
  const session = await currentUser();
  const locale = await getLocale();
  const menuId = uuid.safeParse(formData.get("menuId"));
  const listId = menuId.success ? await shoppingListForMenu(getDb(), session.user.id, menuId.data) : null;
  revalidatePath("/app/courses", "layout");
  return redirect({ href: listId ? `/app/courses/${listId}` : "/app/courses", locale });
}

/** Liste de courses d'une recette, pour le nombre de personnes affiché. */
export async function recipeShoppingListAction(
  recipeId: string,
  servings: number,
  name: string,
): Promise<string | null> {
  const session = await currentUser();
  if (!uuid.safeParse(recipeId).success) return null;
  const count = Math.round(servings);
  if (!Number.isFinite(count) || count < 1 || count > 1000) return null;
  const id = await createShoppingList(getDb(), session.user.id, {
    name: String(name).slice(0, 120),
    source: "recipes",
    entries: [{ recipeId, servings: count }],
  });
  revalidatePath("/app/courses", "layout");
  return id;
}

export async function toggleShoppingItemAction(itemId: string, checked: boolean): Promise<boolean> {
  const session = await currentUser();
  if (!uuid.safeParse(itemId).success) return false;
  return setShoppingItemChecked(getDb(), session.user.id, itemId, Boolean(checked));
}

export async function deleteShoppingListAction(formData: FormData): Promise<void> {
  const session = await currentUser();
  const id = uuid.safeParse(formData.get("id"));
  if (id.success) await deleteShoppingList(getDb(), session.user.id, id.data);
  revalidatePath("/app/courses", "layout");
  return redirect({ href: "/app/courses", locale: await getLocale() });
}
