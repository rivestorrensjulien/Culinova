/**
 * Domaine 5 · Ingrédients, fournisseurs, prix.
 * Prix au kilo (ou au litre, ou à la pièce selon l'unité de référence) en euros, numeric(12,4).
 */
import {
  type AnyPgColumn,
  boolean,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  uniqueIndex,
  uuid,
  primaryKey,
} from "drizzle-orm/pg-core";
import { emptyTextArray, id, timestamps, tz } from "./_shared";
import { languages } from "./culinary";
import { users } from "./identity";

export const ingredientCategories = pgTable("ingredient_categories", {
  id: id(),
  code: text("code").notNull().unique(),
  parentId: uuid("parent_id").references((): AnyPgColumn => ingredientCategories.id),
  sortOrder: integer("sort_order").notNull().default(0),
  ...timestamps,
});

export const ingredientCategoryTranslations = pgTable(
  "ingredient_category_translations",
  {
    categoryId: uuid("category_id")
      .notNull()
      .references(() => ingredientCategories.id, { onDelete: "cascade" }),
    languageCode: text("language_code")
      .notNull()
      .references(() => languages.code),
    name: text("name").notNull(),
    ...timestamps,
  },
  (t) => [primaryKey({ columns: [t.categoryId, t.languageCode] })],
);

export const ingredients = pgTable(
  "ingredients",
  {
    id: id(),
    /** global = référentiel commun ; owner = ingrédient créé par une personne. */
    scope: text("scope").$type<"global" | "owner">().notNull(),
    ownerId: uuid("owner_id").references(() => users.id, { onDelete: "cascade" }),
    code: text("code").unique(),
    canonicalName: text("canonical_name").notNull(),
    categoryId: uuid("category_id").references(() => ingredientCategories.id),
    referenceUnit: text("reference_unit").$type<"g" | "ml" | "piece">().notNull(),
    densityGPerMl: numeric("density_g_per_ml", { precision: 8, scale: 4 }),
    pieceWeightG: numeric("piece_weight_g", { precision: 10, scale: 2 }),
    allergens: text("allergens").array().notNull().default(emptyTextArray),
    diets: text("diets").array().notNull().default(emptyTextArray),
    ciqualCode: text("ciqual_code"),
    fdcId: integer("fdc_id"),
    nutritionPer100g: jsonb("nutrition_per_100g").$type<Record<string, number>>(),
    status: text("status").$type<"confirmed" | "to_confirm">().notNull().default("confirmed"),
    deletedAt: tz("deleted_at"),
    ...timestamps,
  },
  (t) => [index("ingredients_owner_idx").on(t.ownerId), index("ingredients_category_idx").on(t.categoryId)],
);

export const ingredientTranslations = pgTable(
  "ingredient_translations",
  {
    ingredientId: uuid("ingredient_id")
      .notNull()
      .references(() => ingredients.id, { onDelete: "cascade" }),
    languageCode: text("language_code")
      .notNull()
      .references(() => languages.code),
    name: text("name").notNull(),
    plural: text("plural"),
    ...timestamps,
  },
  (t) => [primaryKey({ columns: [t.ingredientId, t.languageCode] })],
);

/** Autres noms d'un ingrédient (rapprochement IA, lecture de factures). */
export const ingredientAliases = pgTable(
  "ingredient_aliases",
  {
    id: id(),
    ingredientId: uuid("ingredient_id")
      .notNull()
      .references(() => ingredients.id, { onDelete: "cascade" }),
    alias: text("alias").notNull(),
    languageCode: text("language_code")
      .notNull()
      .references(() => languages.code),
    ...timestamps,
  },
  (t) => [uniqueIndex("ingredient_aliases_unique").on(t.ingredientId, t.alias, t.languageCode)],
);

export const suppliers = pgTable("suppliers", {
  id: id(),
  ownerId: uuid("owner_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  contact: text("contact"),
  notes: text("notes"),
  deletedAt: tz("deleted_at"),
  ...timestamps,
});

/** Origine d'un prix : saisi, facture, référence globale, ou estimé par l'IA (à confirmer). */
export type PriceSource = "manual" | "invoice" | "receipt" | "reference" | "ai_estimate";

/** Prix d'un ingrédient. Un prix propre à la personne prime sur le prix de référence global. */
export const ingredientPrices = pgTable(
  "ingredient_prices",
  {
    id: id(),
    ingredientId: uuid("ingredient_id")
      .notNull()
      .references(() => ingredients.id, { onDelete: "cascade" }),
    /** Null = prix de référence global. */
    ownerId: uuid("owner_id").references(() => users.id, { onDelete: "cascade" }),
    supplierId: uuid("supplier_id").references(() => suppliers.id, { onDelete: "set null" }),
    /** Prix par unité de référence (kg, l ou pièce), en euros. */
    pricePerKg: numeric("price_per_kg", { precision: 12, scale: 4 }).notNull(),
    packaging: text("packaging"),
    validFrom: tz("valid_from").notNull().defaultNow(),
    isCurrent: boolean("is_current").notNull().default(true),
    source: text("source").$type<PriceSource>().notNull(),
    /** Prix promotionnel (ticket de caisse) : jamais compté dans les prix de référence. */
    isPromo: boolean("is_promo").notNull().default(false),
    ...timestamps,
  },
  (t) => [index("ingredient_prices_lookup_idx").on(t.ingredientId, t.ownerId, t.isCurrent)],
);

export const supplierInvoices = pgTable("supplier_invoices", {
  id: id(),
  ownerId: uuid("owner_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  supplierId: uuid("supplier_id").references(() => suppliers.id, { onDelete: "set null" }),
  fileKey: text("file_key").notNull(),
  /** Facture de fournisseur (pro) ou ticket de caisse (particulier, P8 : photo jamais gardée). */
  kind: text("kind").$type<"invoice" | "receipt">().notNull().default("invoice"),
  invoiceDate: tz("invoice_date"),
  status: text("status").$type<"uploaded" | "parsed" | "reviewed">().notNull().default("uploaded"),
  parsedAt: tz("parsed_at"),
  ...timestamps,
});

export const supplierInvoiceLines = pgTable("supplier_invoice_lines", {
  id: id(),
  supplierInvoiceId: uuid("supplier_invoice_id")
    .notNull()
    .references(() => supplierInvoices.id, { onDelete: "cascade" }),
  rawLabel: text("raw_label").notNull(),
  /** Nom lisible proposé par l'IA (« Beurre doux » pour « BEUR DX PDT 250G »). */
  cleanName: text("clean_name"),
  /** Prix en promotion sur le ticket (remise, lot, prix barré). */
  promo: boolean("promo").notNull().default(false),
  quantity: numeric("quantity", { precision: 12, scale: 3 }),
  unit: text("unit"),
  unitPriceCents: integer("unit_price_cents"),
  matchedIngredientId: uuid("matched_ingredient_id").references(() => ingredients.id, {
    onDelete: "set null",
  }),
  proposedPricePerKg: numeric("proposed_price_per_kg", { precision: 12, scale: 4 }),
  decision: text("decision").$type<"pending" | "accepted" | "rejected">().notNull().default("pending"),
  decidedAt: tz("decided_at"),
  ...timestamps,
});

/** Historique des prix : chaque changement validé y est écrit. */
export const priceHistory = pgTable(
  "price_history",
  {
    id: id(),
    ingredientPriceId: uuid("ingredient_price_id").references(() => ingredientPrices.id, {
      onDelete: "set null",
    }),
    ingredientId: uuid("ingredient_id")
      .notNull()
      .references(() => ingredients.id, { onDelete: "cascade" }),
    ownerId: uuid("owner_id").references(() => users.id, { onDelete: "cascade" }),
    oldPricePerKg: numeric("old_price_per_kg", { precision: 12, scale: 4 }),
    newPricePerKg: numeric("new_price_per_kg", { precision: 12, scale: 4 }).notNull(),
    changedAt: tz("changed_at").notNull().defaultNow(),
    changedBy: uuid("changed_by").references(() => users.id, { onDelete: "set null" }),
    source: text("source").$type<PriceSource>().notNull(),
    supplierInvoiceLineId: uuid("supplier_invoice_line_id").references(() => supplierInvoiceLines.id, {
      onDelete: "set null",
    }),
  },
  (t) => [index("price_history_ingredient_idx").on(t.ingredientId, t.changedAt)],
);

export const priceAlerts = pgTable("price_alerts", {
  id: id(),
  ownerId: uuid("owner_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  ingredientId: uuid("ingredient_id")
    .notNull()
    .references(() => ingredients.id, { onDelete: "cascade" }),
  thresholdPct: numeric("threshold_pct", { precision: 6, scale: 2 }).notNull(),
  lastTriggeredAt: tz("last_triggered_at"),
  ...timestamps,
});

/**
 * Mémoire des libellés de tickets (P8) : « BEUR DX PDT 250G » chez tel magasin = tel ingrédient.
 * Écrite à chaque ligne validée, relue au ticket suivant pour rapprocher sans se tromper.
 */
export const priceAliases = pgTable(
  "price_aliases",
  {
    id: id(),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** Magasin normalisé (vide si inconnu). */
    storeKey: text("store_key").notNull().default(""),
    /** Libellé du ticket normalisé. */
    labelKey: text("label_key").notNull(),
    ingredientId: uuid("ingredient_id")
      .notNull()
      .references(() => ingredients.id, { onDelete: "cascade" }),
    ...timestamps,
  },
  (t) => [uniqueIndex("price_aliases_owner_label_idx").on(t.ownerId, t.storeKey, t.labelKey)],
);

/**
 * Prix de référence des particuliers (P8) : médiane des prix validés (saisis, factures, tickets,
 * hors promotions) par au moins 3 personnes pour un même ingrédient (nom normalisé + unité).
 * Anonyme et agrégé, recalculé chaque jour ; sert quand la personne n'a pas son propre prix.
 */
export const referencePrices = pgTable(
  "reference_prices",
  {
    nameKey: text("name_key").notNull(),
    unit: text("unit").$type<"kg" | "l" | "piece">().notNull(),
    pricePerUnit: numeric("price_per_unit", { precision: 12, scale: 4 }).notNull(),
    /** Nombre de personnes dont les prix forment la médiane. */
    owners: integer("owners").notNull(),
    updatedAt: tz("updated_at").notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.nameKey, t.unit] })],
);
