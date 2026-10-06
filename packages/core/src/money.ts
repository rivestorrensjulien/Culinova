/**
 * Argent.
 *
 * Règle du projet : les montants sont stockés en centimes entiers (`*_cents`).
 * Les prix au kilo (ou au litre) sont stockés en base dans une colonne
 * `numeric(12,4)` exprimée en centimes : « 1234.5678 » = 12,345678 €/kg.
 *
 * Pour éviter les erreurs d'arrondi des nombres à virgule, les calculs
 * intermédiaires utilisent des entiers exacts (`bigint`) exprimés en
 * dix-millièmes de centime, et l'arrondi au centime n'a lieu qu'à la fin.
 */

/** Nombre de dix-millièmes de centime dans un centime. */
export const PRICE_SCALE = 10_000n;

/** Montant exact, en dix-millièmes de centime. */
export type ExactAmount = bigint;

/**
 * Lit un prix au format `numeric(12,4)` (chaîne renvoyée par PostgreSQL,
 * ex. "1234.5" ou "0.0042") et le convertit en dix-millièmes de centime.
 */
export function parsePrice(value: string | number): ExactAmount {
  const text = typeof value === "number" ? value.toFixed(4) : value.trim();
  const match = /^(\d+)(?:\.(\d{1,4}))?$/.exec(text);
  if (!match) {
    throw new RangeError(`Prix invalide : « ${value} » (attendu : nombre positif, 4 décimales au plus)`);
  }
  const [, units = "0", decimals = ""] = match;
  return BigInt(units) * PRICE_SCALE + BigInt(decimals.padEnd(4, "0"));
}

/** Convertit un montant exact en chaîne `numeric(12,4)` (pour l'écriture en base). */
export function formatPrice(amount: ExactAmount): string {
  if (amount < 0n) throw new RangeError("Un prix ne peut pas être négatif");
  const units = amount / PRICE_SCALE;
  const decimals = (amount % PRICE_SCALE).toString().padStart(4, "0");
  return `${units}.${decimals}`;
}

/**
 * Division entière arrondie « au plus proche, demi vers l'extérieur de zéro »
 * (arrondi commercial).
 */
export function divRound(numerator: bigint, denominator: bigint): bigint {
  if (denominator === 0n) throw new RangeError("Division par zéro");
  const negative = numerator < 0n !== denominator < 0n;
  const n = numerator < 0n ? -numerator : numerator;
  const d = denominator < 0n ? -denominator : denominator;
  const q = (n * 2n + d) / (d * 2n);
  return negative ? -q : q;
}

/** Arrondit un montant exact au centime le plus proche. */
export function toCents(amount: ExactAmount): number {
  return Number(divRound(amount, PRICE_SCALE));
}

/** Convertit des centimes entiers en montant exact. */
export function fromCents(cents: number): ExactAmount {
  assertCents(cents);
  return BigInt(cents) * PRICE_SCALE;
}

export function assertCents(cents: number): void {
  if (!Number.isSafeInteger(cents)) {
    throw new RangeError(`Montant en centimes invalide : ${cents} (entier attendu)`);
  }
}

/** Affiche un montant en centimes dans la devise et la langue de l'utilisateur. */
export function formatCents(cents: number, locale = "fr-FR", currency = "EUR"): string {
  assertCents(cents);
  return new Intl.NumberFormat(locale, { style: "currency", currency }).format(cents / 100);
}
