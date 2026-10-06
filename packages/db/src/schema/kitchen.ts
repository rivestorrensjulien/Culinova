/** Domaine 8 · Organisation de la cuisine : menus, courses, stocks, exports. */
import { boolean, index, integer, jsonb, numeric, pgTable, text, uuid } from "drizzle-orm/pg-core";
import { id, timestamps, tz } from "./_shared";
import { users } from "./identity";
import { ingredients, suppliers } from "./ingredients";
import { recipes } from "./recipes";

export const menus = pgTable("menus", {
  id: id(),
  ownerId: uuid("owner_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  guests: integer("guests").notNull().default(4),
  eventDate: tz("event_date"),
  deletedAt: tz("deleted_at"),
  ...timestamps,
});

export const menuItems = pgTable(
  "menu_items",
  {
    id: id(),
    menuId: uuid("menu_id")
      .notNull()
      .references(() => menus.id, { onDelete: "cascade" }),
    recipeId: uuid("recipe_id")
      .notNull()
      .references(() => recipes.id, { onDelete: "cascade" }),
    course: text("course").$type<"starter" | "main" | "dessert" | "drink" | "other">().notNull(),
    servings: integer("servings").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
    ...timestamps,
  },
  (t) => [index("menu_items_menu_idx").on(t.menuId)],
);

export const shoppingLists = pgTable("shopping_lists", {
  id: id(),
  ownerId: uuid("owner_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  source: text("source").$type<"recipes" | "menu" | "manual">().notNull(),
  ...timestamps,
});

export const shoppingListItems = pgTable(
  "shopping_list_items",
  {
    id: id(),
    shoppingListId: uuid("shopping_list_id")
      .notNull()
      .references(() => shoppingLists.id, { onDelete: "cascade" }),
    ingredientId: uuid("ingredient_id")
      .notNull()
      .references(() => ingredients.id),
    quantityG: numeric("quantity_g", { precision: 12, scale: 3 }),
    quantityMl: numeric("quantity_ml", { precision: 12, scale: 3 }),
    quantityPiece: numeric("quantity_piece", { precision: 10, scale: 2 }),
    checked: boolean("checked").notNull().default(false),
    sources: jsonb("sources").$type<Array<{ recipeId: string; quantity: number }>>(),
    ...timestamps,
  },
  (t) => [index("shopping_list_items_list_idx").on(t.shoppingListId)],
);

export const inventoryItems = pgTable("inventory_items", {
  id: id(),
  ownerId: uuid("owner_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  ingredientId: uuid("ingredient_id")
    .notNull()
    .references(() => ingredients.id),
  quantityG: numeric("quantity_g", { precision: 12, scale: 3 }),
  quantityMl: numeric("quantity_ml", { precision: 12, scale: 3 }),
  quantityPiece: numeric("quantity_piece", { precision: 10, scale: 2 }),
  minQuantityG: numeric("min_quantity_g", { precision: 12, scale: 3 }),
  purchasedAt: tz("purchased_at"),
  bestBefore: tz("best_before"),
  supplierId: uuid("supplier_id").references(() => suppliers.id, { onDelete: "set null" }),
  purchasePriceCents: integer("purchase_price_cents"),
  ...timestamps,
});

export const exports = pgTable("exports", {
  id: id(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  kind: text("kind").$type<"pdf_sheet" | "image" | "menu" | "list">().notNull(),
  targetId: uuid("target_id"),
  fileKey: text("file_key"),
  at: tz("at").notNull().defaultNow(),
});
