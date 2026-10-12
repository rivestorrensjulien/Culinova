/**
 * Données de départ, idempotentes : relancer le seed met à jour sans dupliquer.
 */
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { and, eq, sql } from "drizzle-orm";
import type { Database } from "../index";
import * as s from "../schema";
import { SETTING_KEYS } from "../schema";
import { COUNTRIES, CUISINES, REGIONS } from "./data/geography";
import { dietsFor, INGREDIENT_CATEGORIES, INGREDIENTS } from "./data/ingredients";
import { LEGAL_DOCUMENTS, PROCESSING_REGISTER } from "./data/legal";
import { INFLUENCES, LANGUAGES, MEAL_MOMENTS, STYLES } from "./data/reference";

type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];

/** Compare deux numéros de version « 1.0 », « 1.2 », « 0.1 » (négatif si a < b). */
export function compareVersions(a: string, b: string): number {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}
type TranslationTable =
  | typeof s.mealMomentTranslations
  | typeof s.culinaryInfluenceTranslations
  | typeof s.culinaryRegionTranslations
  | typeof s.countryTranslations
  | typeof s.cuisineTranslations
  | typeof s.culinaryStyleTranslations;

async function upsertTranslations(
  tx: Tx,
  table: TranslationTable,
  entityId: string,
  labels: { fr: string; en: string; descFr?: string | undefined; descEn?: string | undefined },
) {
  const rows = [
    { entityId, languageCode: "fr", name: labels.fr, description: labels.descFr ?? null },
    { entityId, languageCode: "en", name: labels.en, description: labels.descEn ?? null },
  ];
  await tx
    .insert(table)
    .values(rows)
    .onConflictDoUpdate({
      target: [table.entityId, table.languageCode],
      set: { name: sql`excluded.name`, description: sql`excluded.description` },
    });
}

async function seedReference(tx: Tx) {
  for (const lang of LANGUAGES) {
    await tx
      .insert(s.languages)
      .values({ ...lang, isActive: true })
      .onConflictDoUpdate({ target: s.languages.code, set: { name: lang.name, sortOrder: lang.sortOrder } });
  }

  for (const [index, m] of MEAL_MOMENTS.entries()) {
    const [row] = await tx
      .insert(s.mealMoments)
      .values({ code: m.code, sortOrder: index + 1 })
      .onConflictDoUpdate({ target: s.mealMoments.code, set: { sortOrder: index + 1 } })
      .returning({ id: s.mealMoments.id });
    await upsertTranslations(tx, s.mealMomentTranslations, row!.id, m);
  }

  for (const [index, st] of STYLES.entries()) {
    const [row] = await tx
      .insert(s.culinaryStyles)
      .values({ code: st.code, allowsFusion: st.allowsFusion, sortOrder: index + 1 })
      .onConflictDoUpdate({
        target: s.culinaryStyles.code,
        set: { allowsFusion: st.allowsFusion, sortOrder: index + 1 },
      })
      .returning({ id: s.culinaryStyles.id });
    await upsertTranslations(tx, s.culinaryStyleTranslations, row!.id, st);
  }
}

async function seedGeography(tx: Tx) {
  const influenceIds = new Map<string, string>();
  for (const [index, inf] of INFLUENCES.entries()) {
    const [row] = await tx
      .insert(s.culinaryInfluences)
      .values({ code: inf.code, kind: inf.kind, sortOrder: index + 1 })
      .onConflictDoUpdate({
        target: s.culinaryInfluences.code,
        set: { kind: inf.kind, sortOrder: index + 1 },
      })
      .returning({ id: s.culinaryInfluences.id });
    influenceIds.set(inf.code, row!.id);
    await upsertTranslations(tx, s.culinaryInfluenceTranslations, row!.id, inf);
  }

  const regionIds = new Map<string, string>();
  for (const r of REGIONS) {
    const influenceId = influenceIds.get(r.influence)!;
    const [row] = await tx
      .insert(s.culinaryRegions)
      .values({ code: r.code, influenceId, level: 1 })
      .onConflictDoUpdate({ target: s.culinaryRegions.code, set: { influenceId } })
      .returning({ id: s.culinaryRegions.id });
    regionIds.set(r.code, row!.id);
    await upsertTranslations(tx, s.culinaryRegionTranslations, row!.id, r);
  }

  const countryIds = new Map<string, { id: string; regionId: string }>();
  for (const c of COUNTRIES) {
    const regionId = regionIds.get(c.region)!;
    const [row] = await tx
      .insert(s.countries)
      .values({ isoCode: c.iso, regionId })
      .onConflictDoUpdate({ target: s.countries.isoCode, set: { regionId } })
      .returning({ id: s.countries.id });
    countryIds.set(c.iso, { id: row!.id, regionId });
    await upsertTranslations(tx, s.countryTranslations, row!.id, c);
  }

  const cuisineIds = new Map<string, string>();
  // Les cuisines nationales d'abord, pour que les cuisines spécifiques trouvent leur parent.
  const ordered = [...CUISINES].sort((a, b) => Number(Boolean(a.parent)) - Number(Boolean(b.parent)));
  for (const c of ordered) {
    const country = countryIds.get(c.country)!;
    const values = {
      code: c.code,
      countryId: country.id,
      regionId: country.regionId,
      parentId: c.parent ? cuisineIds.get(c.parent)! : null,
      precisionLevel: c.parent ? 4 : 3,
      signatureIngredients: c.signatureIngredients ?? [],
      techniques: c.techniques ?? [],
      spices: c.spices ?? [],
      referenceDishes: c.referenceDishes ?? [],
    };
    const { code: _code, ...updatable } = values;
    const [row] = await tx
      .insert(s.cuisines)
      .values(values)
      .onConflictDoUpdate({ target: s.cuisines.code, set: updatable })
      .returning({ id: s.cuisines.id });
    cuisineIds.set(c.code, row!.id);
    await upsertTranslations(tx, s.cuisineTranslations, row!.id, { ...c, descFr: c.descFr });
  }
}

async function seedIngredients(tx: Tx) {
  const categoryIds = new Map<string, string>();
  for (const [index, cat] of INGREDIENT_CATEGORIES.entries()) {
    const [row] = await tx
      .insert(s.ingredientCategories)
      .values({ code: cat.code, sortOrder: index + 1 })
      .onConflictDoUpdate({ target: s.ingredientCategories.code, set: { sortOrder: index + 1 } })
      .returning({ id: s.ingredientCategories.id });
    categoryIds.set(cat.code, row!.id);
    await tx
      .insert(s.ingredientCategoryTranslations)
      .values([
        { categoryId: row!.id, languageCode: "fr", name: cat.fr },
        { categoryId: row!.id, languageCode: "en", name: cat.en },
      ])
      .onConflictDoUpdate({
        target: [s.ingredientCategoryTranslations.categoryId, s.ingredientCategoryTranslations.languageCode],
        set: { name: sql`excluded.name` },
      });
  }

  for (const ing of INGREDIENTS) {
    const values = {
      scope: "global" as const,
      code: ing.code,
      canonicalName: ing.fr,
      categoryId: categoryIds.get(ing.category)!,
      referenceUnit: ing.unit,
      densityGPerMl: ing.density?.toString() ?? null,
      pieceWeightG: ing.pieceWeight?.toString() ?? null,
      allergens: ing.allergens ?? [],
      diets: dietsFor(ing),
      status: "confirmed" as const,
    };
    const { code: _code, scope: _scope, ...updatable } = values;
    const [row] = await tx
      .insert(s.ingredients)
      .values(values)
      .onConflictDoUpdate({ target: s.ingredients.code, set: updatable })
      .returning({ id: s.ingredients.id });
    await tx
      .insert(s.ingredientTranslations)
      .values([
        { ingredientId: row!.id, languageCode: "fr", name: ing.fr },
        { ingredientId: row!.id, languageCode: "en", name: ing.en },
      ])
      .onConflictDoUpdate({
        target: [s.ingredientTranslations.ingredientId, s.ingredientTranslations.languageCode],
        set: { name: sql`excluded.name` },
      });
  }
}

async function seedAccessAndLegal(tx: Tx) {
  await tx
    .insert(s.subscriptionPlans)
    .values({ code: "invitation", tier: "invitation", name: "Invitation (V1)", quotas: {}, isPublic: false })
    .onConflictDoNothing({ target: s.subscriptionPlans.code });

  // Paramètres : créés une seule fois, ensuite modifiés depuis l'admin (jamais écrasés par le seed).
  await tx
    .insert(s.siteSettings)
    .values([
      { key: SETTING_KEYS.defaultQuotas, value: { recipes: 5, images: 10, regenerations: 2 } },
      { key: SETTING_KEYS.monthlyAiBudget, value: { capUsdMicros: null } },
    ])
    .onConflictDoNothing({ target: s.siteSettings.key });

  // Documents juridiques : une version plus récente que celle en vigueur la remplace.
  for (const doc of LEGAL_DOCUMENTS) {
    const [current] = await tx
      .select({ id: s.legalDocuments.id, version: s.legalDocuments.version })
      .from(s.legalDocuments)
      .where(
        and(
          eq(s.legalDocuments.type, doc.type),
          eq(s.legalDocuments.locale, "fr"),
          eq(s.legalDocuments.isCurrent, true),
        ),
      );
    if (current && compareVersions(current.version, doc.version) >= 0) continue;
    if (current) {
      await tx
        .update(s.legalDocuments)
        .set({ isCurrent: false, updatedAt: new Date() })
        .where(eq(s.legalDocuments.id, current.id));
    }
    await tx
      .insert(s.legalDocuments)
      .values({ ...doc, locale: "fr", publishedAt: new Date(), isCurrent: true })
      .onConflictDoUpdate({
        target: [s.legalDocuments.type, s.legalDocuments.locale, s.legalDocuments.version],
        set: { title: doc.title, bodyMd: doc.bodyMd, isCurrent: true, updatedAt: new Date() },
      });
  }

  // Registre des traitements : reflète toujours la dernière description.
  await tx.delete(s.processingRegister);
  await tx.insert(s.processingRegister).values(PROCESSING_REGISTER);
}

/** Crée ou met à jour toutes les données de référence. */
/** Fichier produit par la tâche GitHub « Données Ciqual » (scripts/ciqual-convert.mjs). */
interface CiqualFile {
  version: string;
  columns: string[];
  foods: Array<Array<string | number | null>>;
}

/**
 * Table Ciqual de l'ANSES (aliments et valeurs nutritionnelles pour 100 g).
 * Rechargée seulement quand la version du fichier change.
 */
async function seedNutrition(tx: Tx) {
  const path = fileURLToPath(new URL("./data/ciqual.json", import.meta.url));
  if (!existsSync(path)) return;
  const table = JSON.parse(readFileSync(path, "utf8")) as CiqualFile;
  const [current] = await tx
    .select({ n: sql<number>`count(*)::int` })
    .from(s.nutritionFoods)
    .where(and(eq(s.nutritionFoods.source, "ciqual"), eq(s.nutritionFoods.version, table.version)));
  if (current?.n === table.foods.length) return;

  const nutrientColumns = table.columns.slice(3);
  const rows = table.foods.map((food) => {
    const per100g: s.NutritionValues = {};
    nutrientColumns.forEach((key, i) => {
      const value = food[3 + i];
      if (typeof value === "number") per100g[key as keyof s.NutritionValues] = value;
    });
    return {
      source: "ciqual" as const,
      code: String(food[0]),
      nameFr: food[1] === null ? null : String(food[1]),
      nameEn: food[2] === null ? null : String(food[2]),
      per100g,
      version: table.version,
    };
  });
  for (let i = 0; i < rows.length; i += 500) {
    await tx
      .insert(s.nutritionFoods)
      .values(rows.slice(i, i + 500))
      .onConflictDoUpdate({
        target: [s.nutritionFoods.source, s.nutritionFoods.code],
        set: {
          nameFr: sql`excluded.name_fr`,
          nameEn: sql`excluded.name_en`,
          per100g: sql`excluded.per_100g`,
          version: sql`excluded.version`,
          updatedAt: new Date(),
        },
      });
  }
}

export async function seed(db: Database): Promise<void> {
  await db.transaction(async (tx) => {
    await seedReference(tx);
    await seedGeography(tx);
    await seedIngredients(tx);
    await seedAccessAndLegal(tx);
    await seedNutrition(tx);
  });
}

/**
 * Garantit l'existence du compte administrateur principal (sans invitation).
 * Il se connecte ensuite par lien magique et configure son second facteur.
 */
export async function ensureAdmin(db: Database, email: string): Promise<{ id: string; created: boolean }> {
  const normalized = email.trim().toLowerCase();
  const [existing] = await db
    .select({ id: s.users.id })
    .from(s.users)
    .where(sql`lower(${s.users.email}) = ${normalized}`);
  if (existing) {
    await db.update(s.users).set({ role: "admin" }).where(eq(s.users.id, existing.id));
    return { id: existing.id, created: false };
  }
  const [created] = await db
    .insert(s.users)
    .values({ email: normalized, name: "Administrateur", role: "admin", emailVerified: true })
    .returning({ id: s.users.id });
  return { id: created!.id, created: true };
}
