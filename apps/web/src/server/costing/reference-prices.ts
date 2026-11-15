/**
 * Prix de référence des particuliers (P8) : pour chaque ingrédient (nom normalisé + unité), la
 * médiane des prix actuels validés par au moins 3 personnes — saisis, factures, tickets ; jamais
 * les estimations de l'IA ni les promotions. Anonyme : seuls la médiane et le nombre de
 * personnes sont gardés. Recalculé chaque jour (purge quotidienne) ; sert de prix quand la
 * personne n'a pas le sien, avant toute estimation de l'IA.
 */
import { formatPrice, median, normalizeIngredientName, parsePrice } from "@culinova/core";
import type { Database } from "@culinova/db";
import * as s from "@culinova/db/schema";
import { and, eq, inArray, isNotNull, isNull, sql } from "drizzle-orm";
import { type PriceUnit, priceUnitOf } from "./prices";

/** Au moins 3 personnes : une médiane fiable, et aucun prix individuel reconnaissable. */
export const REFERENCE_MIN_OWNERS = 3;

/** Clé d'un ingrédient : son nom normalisé (« Œufs frais » et « oeuf frais » se rejoignent). */
export function referenceNameKey(name: string): string {
  return normalizeIngredientName(name.replace(/œ/g, "oe").replace(/Œ/g, "Oe"));
}

export async function refreshReferencePrices(
  db: Database,
  now = new Date(),
  /** Seulement ces ingrédients (noms normalisés) ; tous par défaut. */
  only?: readonly string[],
): Promise<number> {
  const wanted = only ? new Set(only) : null;
  const rows = await db
    .select({
      ownerId: s.ingredientPrices.ownerId,
      price: s.ingredientPrices.pricePerKg,
      validFrom: s.ingredientPrices.validFrom,
      name: s.ingredients.canonicalName,
      referenceUnit: s.ingredients.referenceUnit,
    })
    .from(s.ingredientPrices)
    .innerJoin(s.ingredients, eq(s.ingredients.id, s.ingredientPrices.ingredientId))
    .where(
      and(
        isNotNull(s.ingredientPrices.ownerId),
        eq(s.ingredientPrices.isCurrent, true),
        eq(s.ingredientPrices.isPromo, false),
        inArray(s.ingredientPrices.source, ["manual", "invoice", "receipt"]),
        isNull(s.ingredients.deletedAt),
      ),
    );

  // Un prix par personne et par ingrédient : le plus récent.
  const groups = new Map<
    string,
    { unit: PriceUnit; key: string; byOwner: Map<string, { price: number; at: number }> }
  >();
  for (const row of rows) {
    const key = referenceNameKey(row.name);
    if (!key || !row.ownerId || (wanted && !wanted.has(key))) continue;
    const unit = priceUnitOf(row.referenceUnit);
    const id = `${key}|${unit}`;
    const group = groups.get(id) ?? { unit, key, byOwner: new Map() };
    const price = Number(row.price);
    const previous = group.byOwner.get(row.ownerId);
    if (price > 0 && (!previous || previous.at < row.validFrom.getTime())) {
      group.byOwner.set(row.ownerId, { price, at: row.validFrom.getTime() });
    }
    groups.set(id, group);
  }

  const values = [...groups.values()]
    .filter((group) => group.byOwner.size >= REFERENCE_MIN_OWNERS)
    .map((group) => ({
      nameKey: group.key,
      unit: group.unit,
      pricePerUnit: formatPrice(
        parsePrice(median([...group.byOwner.values()].map((v) => v.price))!.toFixed(4)),
      ),
      owners: group.byOwner.size,
      updatedAt: now,
    }));

  await db.transaction(async (tx) => {
    await tx
      .delete(s.referencePrices)
      .where(wanted ? inArray(s.referencePrices.nameKey, [...wanted]) : undefined);
    if (values.length > 0) await tx.insert(s.referencePrices).values(values);
  });
  return values.length;
}

export interface ReferencePrice {
  price: string;
  unit: PriceUnit;
  owners: number;
}

/** Prix de référence des ingrédients demandés (par nom et unité). */
export async function referencePricesFor(
  db: Pick<Database, "select">,
  items: ReadonlyArray<{ id: string; name: string; unit: PriceUnit }>,
): Promise<Map<string, ReferencePrice>> {
  const result = new Map<string, ReferencePrice>();
  const keys = [...new Set(items.map((i) => referenceNameKey(i.name)).filter(Boolean))];
  if (keys.length === 0) return result;
  const rows = await db.select().from(s.referencePrices).where(inArray(s.referencePrices.nameKey, keys));
  const byKey = new Map(rows.map((r) => [`${r.nameKey}|${r.unit}`, r]));
  for (const item of items) {
    const row = byKey.get(`${referenceNameKey(item.name)}|${item.unit}`);
    if (row) result.set(item.id, { price: row.pricePerUnit, unit: item.unit, owners: row.owners });
  }
  return result;
}

/** Nombre de prix de référence (administration). */
export async function referencePriceCount(db: Database): Promise<number> {
  const [row] = await db.select({ n: sql<number>`count(*)::int` }).from(s.referencePrices);
  return row?.n ?? 0;
}
