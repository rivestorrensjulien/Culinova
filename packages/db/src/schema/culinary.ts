/**
 * Domaine 4 · Référentiel culinaire (administrable).
 * Les libellés traduisibles vivent dans une table *_translations par entité.
 */
import {
  type AnyPgColumn,
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  uuid,
} from "drizzle-orm/pg-core";
import { emptyTextArray, id, timestamps, tz } from "./_shared";
import { users } from "./identity";

export const languages = pgTable("languages", {
  code: text("code").primaryKey(),
  /** Nom de la langue dans cette langue (« Français », « English »). */
  name: text("name").notNull(),
  isActive: boolean("is_active").notNull().default(true),
  isDefault: boolean("is_default").notNull().default(false),
  sortOrder: integer("sort_order").notNull().default(0),
  ...timestamps,
});

/** Crée la table de traductions d'une entité (nom + description par langue). */
function translations(name: string, parent: () => AnyPgColumn) {
  return pgTable(
    name,
    {
      entityId: uuid("entity_id").notNull().references(parent, { onDelete: "cascade" }),
      languageCode: text("language_code")
        .notNull()
        .references(() => languages.code),
      name: text("name").notNull(),
      description: text("description"),
      ...timestamps,
    },
    (t) => [primaryKey({ columns: [t.entityId, t.languageCode] })],
  );
}

/** Moment de consommation : entrée, plat, dessert… */
export const mealMoments = pgTable("meal_moments", {
  id: id(),
  code: text("code").notNull().unique(),
  sortOrder: integer("sort_order").notNull().default(0),
  isActive: boolean("is_active").notNull().default(true),
  ...timestamps,
});
export const mealMomentTranslations = translations("meal_moment_translations", () => mealMoments.id);

/** Influence culinaire : zone large (Europe, Asie…) ou transversale (fusion, contemporaine…). */
export const culinaryInfluences = pgTable("culinary_influences", {
  id: id(),
  code: text("code").notNull().unique(),
  kind: text("kind").$type<"zone" | "transversal">().notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
  isActive: boolean("is_active").notNull().default(true),
  ...timestamps,
});
export const culinaryInfluenceTranslations = translations(
  "culinary_influence_translations",
  () => culinaryInfluences.id,
);

/** Arbre zone → région (ex. Asie → Asie de l'Est). */
export const culinaryRegions = pgTable(
  "culinary_regions",
  {
    id: id(),
    code: text("code").notNull().unique(),
    influenceId: uuid("influence_id")
      .notNull()
      .references(() => culinaryInfluences.id),
    parentId: uuid("parent_id").references((): AnyPgColumn => culinaryRegions.id),
    level: integer("level").notNull().default(1),
    isActive: boolean("is_active").notNull().default(true),
    ...timestamps,
  },
  (t) => [index("culinary_regions_influence_idx").on(t.influenceId)],
);
export const culinaryRegionTranslations = translations(
  "culinary_region_translations",
  () => culinaryRegions.id,
);

export const countries = pgTable("countries", {
  id: id(),
  isoCode: text("iso_code").notNull().unique(),
  regionId: uuid("region_id")
    .notNull()
    .references(() => culinaryRegions.id),
  isActive: boolean("is_active").notNull().default(true),
  ...timestamps,
});
export const countryTranslations = translations("country_translations", () => countries.id);

/** Cuisine, avec 4 niveaux de précision (zone → région → pays → cuisine spécifique). */
export const cuisines = pgTable(
  "cuisines",
  {
    id: id(),
    code: text("code").notNull().unique(),
    countryId: uuid("country_id").references(() => countries.id),
    regionId: uuid("region_id").references(() => culinaryRegions.id),
    parentId: uuid("parent_id").references((): AnyPgColumn => cuisines.id),
    precisionLevel: integer("precision_level").notNull(),
    signatureIngredients: text("signature_ingredients").array().notNull().default(emptyTextArray),
    techniques: text("techniques").array().notNull().default(emptyTextArray),
    spices: text("spices").array().notNull().default(emptyTextArray),
    referenceDishes: text("reference_dishes").array().notNull().default(emptyTextArray),
    vocabulary: jsonb("vocabulary").$type<Record<string, string>>().notNull().default({}),
    languages: text("languages").array().notNull().default(emptyTextArray),
    isActive: boolean("is_active").notNull().default(true),
    ...timestamps,
  },
  (t) => [index("cuisines_country_idx").on(t.countryId), index("cuisines_region_idx").on(t.regionId)],
);
export const cuisineTranslations = translations("cuisine_translations", () => cuisines.id);

/** Style culinaire : inspiration légère, influence marquée, traditionnel, créatif. */
export const culinaryStyles = pgTable("culinary_styles", {
  id: id(),
  code: text("code").notNull().unique(),
  allowsFusion: boolean("allows_fusion").notNull().default(false),
  sortOrder: integer("sort_order").notNull().default(0),
  isActive: boolean("is_active").notNull().default(true),
  ...timestamps,
});
export const culinaryStyleTranslations = translations("culinary_style_translations", () => culinaryStyles.id);

/** Cuisines favorites et récentes de chaque personne (suggestions du wizard). */
export const userCuisinePrefs = pgTable(
  "user_cuisine_prefs",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    cuisineId: uuid("cuisine_id")
      .notNull()
      .references(() => cuisines.id, { onDelete: "cascade" }),
    kind: text("kind").$type<"favorite" | "recent">().notNull(),
    usedAt: tz("used_at").notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.cuisineId, t.kind] })],
);
