/** Référentiel culinaire (moments, influences, régions, pays, cuisines, styles) traduit. */
import type { Database } from "@culinova/db";
import * as s from "@culinova/db/schema";
import { and, asc, eq, inArray } from "drizzle-orm";

export interface CulinaryReference {
  moments: Array<{ code: string; label: string }>;
  influences: Array<{ code: string; kind: "zone" | "transversal"; label: string }>;
  regions: Array<{ code: string; influenceCode: string; label: string }>;
  countries: Array<{ iso: string; regionCode: string; label: string }>;
  cuisines: Array<{
    code: string;
    countryIso: string | null;
    regionCode: string | null;
    parentCode: string | null;
    level: number;
    label: string;
    description: string | null;
    signatureIngredients: string[];
    techniques: string[];
    spices: string[];
    referenceDishes: string[];
  }>;
  styles: Array<{
    code: "light" | "marked" | "traditional" | "creative";
    allowsFusion: boolean;
    label: string;
    description: string | null;
  }>;
}

type Labelled = { entityId: string; languageCode: string; name: string; description: string | null };

/** Libellé dans la langue demandée, sinon en français. */
function labeller(rows: Labelled[], locale: string) {
  const map = new Map<string, Labelled>();
  for (const row of rows) {
    const current = map.get(row.entityId);
    if (!current || (row.languageCode === locale && current.languageCode !== locale))
      map.set(row.entityId, row);
  }
  return (id: string) => map.get(id) ?? { name: "?", description: null };
}

async function translations(db: Database, table: typeof s.mealMomentTranslations, locale: string) {
  return db
    .select({
      entityId: table.entityId,
      languageCode: table.languageCode,
      name: table.name,
      description: table.description,
    })
    .from(table)
    .where(inArray(table.languageCode, [locale, "fr"]));
}

const cache = new Map<string, { at: number; value: CulinaryReference }>();
const TTL_MS = 5 * 60 * 1000;

export async function loadCulinaryReference(db: Database, locale: string): Promise<CulinaryReference> {
  const cached = cache.get(locale);
  if (cached && Date.now() - cached.at < TTL_MS) return cached.value;

  const [moments, influences, regions, countries, cuisines, styles] = await Promise.all([
    db
      .select()
      .from(s.mealMoments)
      .where(eq(s.mealMoments.isActive, true))
      .orderBy(asc(s.mealMoments.sortOrder)),
    db
      .select()
      .from(s.culinaryInfluences)
      .where(eq(s.culinaryInfluences.isActive, true))
      .orderBy(asc(s.culinaryInfluences.sortOrder)),
    db.select().from(s.culinaryRegions).where(eq(s.culinaryRegions.isActive, true)),
    db.select().from(s.countries).where(eq(s.countries.isActive, true)),
    db
      .select()
      .from(s.cuisines)
      .where(and(eq(s.cuisines.isActive, true))),
    db
      .select()
      .from(s.culinaryStyles)
      .where(eq(s.culinaryStyles.isActive, true))
      .orderBy(asc(s.culinaryStyles.sortOrder)),
  ]);
  const [tm, ti, tr, tc, tcu, ts] = await Promise.all([
    translations(db, s.mealMomentTranslations, locale),
    translations(db, s.culinaryInfluenceTranslations, locale),
    translations(db, s.culinaryRegionTranslations, locale),
    translations(db, s.countryTranslations, locale),
    translations(db, s.cuisineTranslations, locale),
    translations(db, s.culinaryStyleTranslations, locale),
  ]);
  const [lm, li, lr, lc, lcu, ls] = [tm, ti, tr, tc, tcu, ts].map((rows) => labeller(rows, locale));
  const influenceCode = new Map(influences.map((i) => [i.id, i.code]));
  const regionCode = new Map(regions.map((r) => [r.id, r.code]));
  const countryIso = new Map(countries.map((c) => [c.id, c.isoCode]));
  const cuisineCode = new Map(cuisines.map((c) => [c.id, c.code]));
  const byLabel = <T extends { label: string }>(a: T, b: T) => a.label.localeCompare(b.label, locale);

  const value: CulinaryReference = {
    moments: moments.map((m) => ({ code: m.code, label: lm!(m.id).name })),
    influences: influences.map((i) => ({ code: i.code, kind: i.kind, label: li!(i.id).name })),
    regions: regions
      .map((r) => ({ code: r.code, influenceCode: influenceCode.get(r.influenceId)!, label: lr!(r.id).name }))
      .sort(byLabel),
    countries: countries
      .map((c) => ({ iso: c.isoCode, regionCode: regionCode.get(c.regionId)!, label: lc!(c.id).name }))
      .sort(byLabel),
    cuisines: cuisines
      .map((c) => ({
        code: c.code,
        countryIso: c.countryId ? (countryIso.get(c.countryId) ?? null) : null,
        regionCode: c.regionId ? (regionCode.get(c.regionId) ?? null) : null,
        parentCode: c.parentId ? (cuisineCode.get(c.parentId) ?? null) : null,
        level: c.precisionLevel,
        label: lcu!(c.id).name,
        description: lcu!(c.id).description,
        signatureIngredients: c.signatureIngredients,
        techniques: c.techniques,
        spices: c.spices,
        referenceDishes: c.referenceDishes,
      }))
      .sort(byLabel),
    styles: styles.map((st) => ({
      code: st.code as CulinaryReference["styles"][number]["code"],
      allowsFusion: st.allowsFusion,
      label: ls!(st.id).name,
      description: ls!(st.id).description,
    })),
  };
  cache.set(locale, { at: Date.now(), value });
  return value;
}
