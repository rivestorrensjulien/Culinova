/**
 * Nutrition : aliments de référence (table Ciqual de l'ANSES en priorité, USDA
 * FoodData Central en complément) et correspondance entre les ingrédients d'une
 * personne et ces aliments (proposée par l'IA, validée par la personne).
 */
import { index, jsonb, pgTable, primaryKey, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { id, timestamps } from "./_shared";
import { users } from "./identity";
import { ingredients } from "./ingredients";

/** Valeurs pour 100 g (énergie en kcal et kJ, le reste en grammes ; sel = chlorure de sodium). */
export type NutritionValues = Partial<
  Record<"kcal" | "kj" | "protein" | "carbs" | "sugars" | "fiber" | "fat" | "saturated" | "salt", number>
>;

export const nutritionFoods = pgTable(
  "nutrition_foods",
  {
    id: id(),
    source: text("source").$type<"ciqual" | "usda">().notNull(),
    /** Code Ciqual (alim_code) ou identifiant FoodData Central (fdcId). */
    code: text("code").notNull(),
    nameFr: text("name_fr"),
    nameEn: text("name_en"),
    per100g: jsonb("per_100g").$type<NutritionValues>().notNull(),
    /** Version de la table d'origine (ex. « 2025-11-03 »). */
    version: text("version"),
    ...timestamps,
  },
  (t) => [uniqueIndex("nutrition_foods_source_code").on(t.source, t.code)],
);

export const ingredientNutritionLinks = pgTable(
  "ingredient_nutrition_links",
  {
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    ingredientId: uuid("ingredient_id")
      .notNull()
      .references(() => ingredients.id, { onDelete: "cascade" }),
    /** Aliment de référence retenu (null : aucun aliment ne correspond, ingrédient ignoré). */
    foodId: uuid("food_id").references(() => nutritionFoods.id, { onDelete: "set null" }),
    status: text("status").$type<"proposed" | "validated">().notNull().default("proposed"),
    ...timestamps,
  },
  (t) => [
    primaryKey({ columns: [t.ownerId, t.ingredientId] }),
    index("ingredient_nutrition_links_food_idx").on(t.foodId),
  ],
);
