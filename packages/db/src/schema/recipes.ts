/**
 * Domaine 6 · Recettes.
 * Quantités en grammes (quantity_g) ou millilitres (quantity_ml), durées en
 * secondes, températures en °C, montants en centimes. Le coût n'est jamais
 * saisi : recipe_cost_snapshots n'est qu'un cache horodaté.
 */
import {
  type AnyPgColumn,
  boolean,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  text,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { emptyTextArray, id, timestamps, tz } from "./_shared";
import { culinaryInfluences, culinaryRegions, countries, languages, mealMoments } from "./culinary";
import { users } from "./identity";
import { ingredients } from "./ingredients";

export const recipes = pgTable(
  "recipes",
  {
    id: id(),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** Réservé à l'offre Business (phase 2). */
    organizationId: uuid("organization_id"),
    kind: text("kind").$type<"dish" | "base">().notNull().default("dish"),
    currentVersionId: uuid("current_version_id").references((): AnyPgColumn => recipeVersions.id, {
      onDelete: "set null",
    }),
    source: text("source").$type<"generated" | "imported" | "manual">().notNull(),
    originalLanguage: text("original_language")
      .notNull()
      .references(() => languages.code),
    slug: text("slug"),
    visibility: text("visibility").$type<"private" | "org" | "public">().notNull().default("private"),
    status: text("status").$type<"draft" | "ready">().notNull().default("draft"),
    deletedAt: tz("deleted_at"),
    ...timestamps,
  },
  (t) => [index("recipes_owner_idx").on(t.ownerId)],
);

export const DRAFT_STATUSES = ["editing", "generating", "done", "failed", "archived"] as const;
export type DraftStatus = (typeof DRAFT_STATUSES)[number];

/** Brouillons du wizard (sauvegarde automatique, un brouillon ouvert par personne). */
export const recipeDrafts = pgTable(
  "recipe_drafts",
  {
    id: id(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    wizardStep: integer("wizard_step").notNull().default(1),
    state: jsonb("state").$type<Record<string, unknown>>().notNull().default({}),
    status: text("status").$type<DraftStatus>().notNull().default("editing"),
    /** Génération en cours ou dernière génération lancée depuis ce brouillon. */
    generationId: uuid("generation_id"),
    error: text("error"),
    /** Horodatage de la dernière modification côté navigateur (dernier écrit gagnant). */
    clientUpdatedAt: tz("client_updated_at"),
    recipeId: uuid("recipe_id").references(() => recipes.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (t) => [index("recipe_drafts_user_idx").on(t.userId, t.status)],
);

/** Paramètres transmis aux moteurs (recette, image, contenu social). */
export const generationParams = pgTable("generation_params", {
  id: id(),
  momentId: uuid("moment_id").references(() => mealMoments.id),
  influenceId: uuid("influence_id").references(() => culinaryInfluences.id),
  regionId: uuid("region_id").references(() => culinaryRegions.id),
  countryId: uuid("country_id").references(() => countries.id),
  cuisineIds: uuid("cuisine_ids").array().notNull().default([]),
  styleIds: uuid("style_ids").array().notNull().default([]),
  languageCode: text("language_code")
    .notNull()
    .references(() => languages.code),
  mode: text("mode").$type<"ingredients" | "name" | "idea">().notNull(),
  inputText: text("input_text"),
  availableQuantities: jsonb("available_quantities").$type<Record<string, unknown>>(),
  servings: integer("servings").notNull(),
  constraints: jsonb("constraints").$type<Record<string, unknown>>(),
  /** Paramètres résolus (libellés, contexte des cuisines) tels que transmis au moteur. */
  snapshot: jsonb("snapshot").$type<Record<string, unknown>>(),
  ...timestamps,
});

export const recipeVersions = pgTable(
  "recipe_versions",
  {
    id: id(),
    recipeId: uuid("recipe_id")
      .notNull()
      .references(() => recipes.id, { onDelete: "cascade" }),
    versionNo: integer("version_no").notNull(),
    name: text("name").notNull(),
    description: text("description"),
    momentId: uuid("moment_id").references(() => mealMoments.id),
    servings: integer("servings").notNull(),
    prepS: integer("prep_s"),
    cookS: integer("cook_s"),
    restS: integer("rest_s"),
    difficulty: text("difficulty").$type<"easy" | "medium" | "hard">(),
    season: text("season").array().notNull().default(emptyTextArray),
    equipment: text("equipment").array().notNull().default(emptyTextArray),
    plating: jsonb("plating").$type<Record<string, unknown>>(),
    /** Mention explicite « fusion / interprétation créative » le cas échéant. */
    fusionLabel: text("fusion_label"),
    cuisineLabel: text("cuisine_label"),
    allergens: text("allergens").array().notNull().default(emptyTextArray),
    diets: text("diets").array().notNull().default(emptyTextArray),
    tips: text("tips").array().notNull().default(emptyTextArray),
    yieldG: integer("yield_g"),
    generationParamsId: uuid("generation_params_id").references(() => generationParams.id),
    changeNote: text("change_note"),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (t) => [uniqueIndex("recipe_versions_unique").on(t.recipeId, t.versionNo)],
);

/** « Mes bases » : préparations réutilisables (recettes de type base). */
export const baseRecipes = pgTable("base_recipes", {
  id: id(),
  recipeId: uuid("recipe_id")
    .notNull()
    .unique()
    .references(() => recipes.id, { onDelete: "cascade" }),
  yieldG: integer("yield_g").notNull(),
  /** Rendement lisible (8 pains), facultatif. */
  yieldDisplayQuantity: numeric("yield_display_quantity", { precision: 12, scale: 3 }),
  yieldDisplayUnit: text("yield_display_unit"),
  shelfLifeH: integer("shelf_life_h"),
  ...timestamps,
});

export const recipeIngredients = pgTable(
  "recipe_ingredients",
  {
    id: id(),
    recipeVersionId: uuid("recipe_version_id")
      .notNull()
      .references(() => recipeVersions.id, { onDelete: "cascade" }),
    /** Soit un ingrédient, soit une base (« Mes bases »). */
    ingredientId: uuid("ingredient_id").references(() => ingredients.id),
    baseRecipeId: uuid("base_recipe_id").references(() => baseRecipes.id),
    /** Nom tel qu'écrit dans la recette (dans sa langue). */
    label: text("label").notNull().default(""),
    quantityG: numeric("quantity_g", { precision: 12, scale: 3 }),
    quantityMl: numeric("quantity_ml", { precision: 12, scale: 3 }),
    quantityPiece: numeric("quantity_piece", { precision: 10, scale: 2 }),
    displayUnit: text("display_unit"),
    displayQuantity: numeric("display_quantity", { precision: 12, scale: 3 }),
    preparation: text("preparation"),
    groupLabel: text("group_label"),
    sortOrder: integer("sort_order").notNull().default(0),
    optional: boolean("optional").notNull().default(false),
    /** Produit habituellement acheté tout prêt, réalisable maison (null : non renseigné, recettes anciennes). */
    storeBought: boolean("store_bought"),
    ...timestamps,
  },
  (t) => [index("recipe_ingredients_version_idx").on(t.recipeVersionId)],
);

export const recipeSteps = pgTable(
  "recipe_steps",
  {
    id: id(),
    recipeVersionId: uuid("recipe_version_id")
      .notNull()
      .references(() => recipeVersions.id, { onDelete: "cascade" }),
    sortOrder: integer("sort_order").notNull(),
    phase: text("phase").$type<"mise_en_place" | "cooking" | "plating">().notNull(),
    action: text("action").notNull(),
    ingredientRefs: uuid("ingredient_refs").array().notNull().default([]),
    temperatureC: integer("temperature_c"),
    durationS: integer("duration_s"),
    equipment: text("equipment").array().notNull().default(emptyTextArray),
    expectedResult: text("expected_result"),
    timer: boolean("timer").notNull().default(false),
    ...timestamps,
  },
  (t) => [index("recipe_steps_version_idx").on(t.recipeVersionId)],
);

/** Versions linguistiques d'une version de recette (l'originale n'est jamais supprimée). */
export const recipeTranslations = pgTable(
  "recipe_translations",
  {
    id: id(),
    recipeVersionId: uuid("recipe_version_id")
      .notNull()
      .references(() => recipeVersions.id, { onDelete: "cascade" }),
    languageCode: text("language_code")
      .notNull()
      .references(() => languages.code),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    sourceVersionNo: integer("source_version_no").notNull(),
    status: text("status").$type<"up_to_date" | "outdated">().notNull().default("up_to_date"),
    /** Traduction relue et validée par la personne (l'IA propose, la personne valide). */
    validatedAt: tz("validated_at"),
    ...timestamps,
  },
  (t) => [uniqueIndex("recipe_translations_unique").on(t.recipeVersionId, t.languageCode)],
);

export const recipeImages = pgTable(
  "recipe_images",
  {
    id: id(),
    recipeVersionId: uuid("recipe_version_id")
      .notNull()
      .references(() => recipeVersions.id, { onDelete: "cascade" }),
    /** Image HD source, ou recadrage (1:1, 4:5, 9:16, 16:9) issu d'elle. */
    format: text("format").$type<"source" | "1:1" | "4:5" | "9:16" | "16:9">().notNull(),
    sourceImageId: uuid("source_image_id").references((): AnyPgColumn => recipeImages.id, {
      onDelete: "cascade",
    }),
    storageKey: text("storage_key"),
    width: integer("width"),
    height: integer("height"),
    prompt: text("prompt"),
    model: text("model"),
    overlayText: text("overlay_text"),
    overlayLanguage: text("overlay_language"),
    isPrimary: boolean("is_primary").notNull().default(false),
    status: text("status").$type<"pending" | "ready" | "failed">().notNull().default("pending"),
    ...timestamps,
  },
  (t) => [index("recipe_images_version_idx").on(t.recipeVersionId)],
);

/** Paramètres de prix d'une version (le prix de vente HT peut être saisi ou laissé vide). */
export const recipePricing = pgTable("recipe_pricing", {
  recipeVersionId: uuid("recipe_version_id")
    .primaryKey()
    .references(() => recipeVersions.id, { onDelete: "cascade" }),
  coefficient: numeric("coefficient", { precision: 8, scale: 4 }),
  vatRate: numeric("vat_rate", { precision: 5, scale: 2 }),
  sellingPriceHtCents: integer("selling_price_ht_cents"),
  /** Prix TTC tel que saisi (le prix HT en est déduit, sans écart d'arrondi à l'affichage). */
  sellingPriceTtcCents: integer("selling_price_ttc_cents"),
  laborSeconds: jsonb("labor_seconds").$type<{ prep?: number; watch?: number; plating?: number }>(),
  hourlyRateCents: integer("hourly_rate_cents"),
  energyUses: jsonb("energy_uses").$type<Array<{ applianceId: string; seconds: number }>>(),
  ...timestamps,
});

/** Cache du coût calculé, invalidé à chaque changement de prix (empreinte des prix utilisés). */
export const recipeCostSnapshots = pgTable("recipe_cost_snapshots", {
  recipeVersionId: uuid("recipe_version_id")
    .primaryKey()
    .references(() => recipeVersions.id, { onDelete: "cascade" }),
  materialCents: integer("material_cents").notNull(),
  laborCents: integer("labor_cents").notNull().default(0),
  energyCents: integer("energy_cents").notNull().default(0),
  perPortionCents: integer("per_portion_cents").notNull(),
  pricesFingerprint: text("prices_fingerprint").notNull(),
  computedAt: tz("computed_at").notNull().defaultNow(),
});

export const appliances = pgTable("appliances", {
  id: id(),
  ownerId: uuid("owner_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  powerW: integer("power_w").notNull(),
  ...timestamps,
});

/** Paramètres de chiffrage par défaut de chaque compte. */
export const costingSettings = pgTable("costing_settings", {
  ownerId: uuid("owner_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  defaultCoefficient: numeric("default_coefficient", { precision: 8, scale: 4 }).notNull().default("3.5"),
  defaultVatRate: numeric("default_vat_rate", { precision: 5, scale: 2 }).notNull().default("10"),
  hourlyRateCents: integer("hourly_rate_cents"),
  kwhPriceCents: integer("kwh_price_cents"),
  ...timestamps,
});

export const recipeNutrition = pgTable("recipe_nutrition", {
  recipeVersionId: uuid("recipe_version_id")
    .primaryKey()
    .references(() => recipeVersions.id, { onDelete: "cascade" }),
  perPortion: jsonb("per_portion").$type<Record<string, number>>().notNull(),
  allergens: text("allergens").array().notNull().default(emptyTextArray),
  diets: text("diets").array().notNull().default(emptyTextArray),
  computedAt: tz("computed_at").notNull().defaultNow(),
});

export const favorites = pgTable(
  "favorites",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    recipeId: uuid("recipe_id")
      .notNull()
      .references(() => recipes.id, { onDelete: "cascade" }),
    createdAt: tz("created_at").notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.recipeId] })],
);

export const recipeViews = pgTable(
  "recipe_views",
  {
    id: id(),
    recipeId: uuid("recipe_id")
      .notNull()
      .references(() => recipes.id, { onDelete: "cascade" }),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    at: tz("at").notNull().defaultNow(),
  },
  (t) => [index("recipe_views_recipe_idx").on(t.recipeId, t.at)],
);
