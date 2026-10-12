/**
 * Prix des ingrédients. Un prix propre à la personne prime sur le prix de
 * référence global. Chaque changement est écrit dans l'historique.
 */
import { formatPrice, parsePrice } from "@culinova/core";
import type { Database } from "@culinova/db";
import * as s from "@culinova/db/schema";
import { and, desc, eq, inArray, isNull, or } from "drizzle-orm";

type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];
type Executor = Database | Tx;

/** Unité du prix, déduite de l'unité de référence de l'ingrédient. */
export type PriceUnit = "kg" | "l" | "piece";

export function priceUnitOf(referenceUnit: "g" | "ml" | "piece"): PriceUnit {
  return referenceUnit === "g" ? "kg" : referenceUnit === "ml" ? "l" : "piece";
}

export interface CurrentPrice {
  ingredientId: string;
  /** Prix en euros par kg, litre ou pièce, au format « 9.8000 ». */
  price: string;
  unit: PriceUnit;
  supplierName: string | null;
  /** Prix propre à la personne (sinon prix de référence global). */
  own: boolean;
  /** Prix estimé par l'IA, pas encore confirmé par la personne. */
  estimated: boolean;
  validFrom: Date;
}

/** Prix actuels des ingrédients demandés, le prix de la personne passant avant le prix global. */
export async function currentPrices(
  db: Executor,
  userId: string,
  ingredientIds: readonly string[],
): Promise<Map<string, CurrentPrice>> {
  const result = new Map<string, CurrentPrice>();
  if (ingredientIds.length === 0) return result;
  const rows = await db
    .select({
      ingredientId: s.ingredientPrices.ingredientId,
      price: s.ingredientPrices.pricePerKg,
      ownerId: s.ingredientPrices.ownerId,
      source: s.ingredientPrices.source,
      validFrom: s.ingredientPrices.validFrom,
      supplierName: s.suppliers.name,
      referenceUnit: s.ingredients.referenceUnit,
    })
    .from(s.ingredientPrices)
    .innerJoin(s.ingredients, eq(s.ingredients.id, s.ingredientPrices.ingredientId))
    .leftJoin(s.suppliers, eq(s.suppliers.id, s.ingredientPrices.supplierId))
    .where(
      and(
        inArray(s.ingredientPrices.ingredientId, [...ingredientIds]),
        eq(s.ingredientPrices.isCurrent, true),
        or(eq(s.ingredientPrices.ownerId, userId), isNull(s.ingredientPrices.ownerId)),
      ),
    );
  for (const row of rows) {
    const own = row.ownerId === userId;
    const existing = result.get(row.ingredientId);
    if (existing?.own && !own) continue;
    result.set(row.ingredientId, {
      ingredientId: row.ingredientId,
      price: row.price,
      unit: priceUnitOf(row.referenceUnit),
      supplierName: row.supplierName,
      own,
      estimated: row.source === "ai_estimate",
      validFrom: row.validFrom,
    });
  }
  return result;
}

/** Lit un prix saisi (« 9,80 », « 9.8 ») ; renvoie null s'il est invalide ou négatif. */
export function readPriceInput(input: string): string | null {
  const text = input.trim().replace(/\s/g, "").replace(",", ".");
  if (text === "") return null;
  try {
    const amount = parsePrice(text);
    if (amount <= 0n) return null;
    return formatPrice(amount);
  } catch {
    return null;
  }
}

type SavePriceFailure = { ok: false; reason: "invalid" | "not_found" | "exists" };
export type SavePriceResult = { ok: true; price: string } | SavePriceFailure;

/**
 * Enregistre le prix d'un ingrédient pour une personne : l'ancien prix est
 * conservé dans l'historique, le nouveau devient le prix actuel.
 */
export async function savePrice(
  db: Database,
  input: {
    userId: string;
    ingredientId: string;
    price: string;
    supplierName?: string | null;
    /** « ai_estimate » : estimation automatique, jamais enregistrée par-dessus un prix existant. */
    source?: "manual" | "ai_estimate" | "invoice";
    /** Ligne de facture d'où vient le prix. */
    supplierInvoiceLineId?: string | null;
  },
): Promise<SavePriceResult> {
  const source = input.source ?? "manual";
  const price = readPriceInput(input.price);
  if (!price) return { ok: false, reason: "invalid" };
  return db.transaction(async (tx) => {
    const [ingredient] = await tx
      .select({ id: s.ingredients.id })
      .from(s.ingredients)
      .where(
        and(
          eq(s.ingredients.id, input.ingredientId),
          isNull(s.ingredients.deletedAt),
          or(eq(s.ingredients.scope, "global"), eq(s.ingredients.ownerId, input.userId)),
        ),
      );
    if (!ingredient) return { ok: false, reason: "not_found" } as const;

    const previous = (await currentPrices(tx, input.userId, [input.ingredientId])).get(input.ingredientId);
    if (source === "ai_estimate" && previous) return { ok: false, reason: "exists" } as const;
    const supplierId = await supplierFor(tx, input.userId, input.supplierName ?? null);

    await tx
      .update(s.ingredientPrices)
      .set({ isCurrent: false })
      .where(
        and(
          eq(s.ingredientPrices.ingredientId, input.ingredientId),
          eq(s.ingredientPrices.ownerId, input.userId),
          eq(s.ingredientPrices.isCurrent, true),
        ),
      );
    const [row] = await tx
      .insert(s.ingredientPrices)
      .values({
        ingredientId: input.ingredientId,
        ownerId: input.userId,
        supplierId,
        pricePerKg: price,
        source,
        isCurrent: true,
      })
      .returning({ id: s.ingredientPrices.id });
    await tx.insert(s.priceHistory).values({
      ingredientPriceId: row!.id,
      ingredientId: input.ingredientId,
      ownerId: input.userId,
      oldPricePerKg: previous?.price ?? null,
      newPricePerKg: price,
      changedBy: input.userId,
      source,
      supplierInvoiceLineId: input.supplierInvoiceLineId ?? null,
    });
    return { ok: true, price } as const;
  });
}

/** Fournisseur de la personne portant ce nom (créé au besoin) ; null sans nom. */
export async function supplierFor(tx: Executor, userId: string, name: string | null): Promise<string | null> {
  const clean = name?.trim();
  if (!clean) return null;
  const [found] = await tx
    .select({ id: s.suppliers.id })
    .from(s.suppliers)
    .where(and(eq(s.suppliers.ownerId, userId), eq(s.suppliers.name, clean), isNull(s.suppliers.deletedAt)));
  if (found) return found.id;
  const [created] = await tx
    .insert(s.suppliers)
    .values({ ownerId: userId, name: clean })
    .returning({ id: s.suppliers.id });
  return created!.id;
}

/** Historique des prix d'un ingrédient pour une personne, du plus récent au plus ancien. */
export async function priceHistoryOf(db: Database, userId: string, ingredientId: string) {
  return db
    .select({
      oldPrice: s.priceHistory.oldPricePerKg,
      newPrice: s.priceHistory.newPricePerKg,
      changedAt: s.priceHistory.changedAt,
      source: s.priceHistory.source,
    })
    .from(s.priceHistory)
    .where(and(eq(s.priceHistory.ingredientId, ingredientId), eq(s.priceHistory.ownerId, userId)))
    .orderBy(desc(s.priceHistory.changedAt));
}
