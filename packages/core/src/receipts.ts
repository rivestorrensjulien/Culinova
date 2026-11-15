/**
 * Tickets de caisse (P8) : prix au kilo, au litre ou à la pièce d'après une ligne de ticket,
 * clé de comparaison des libellés (« BEUR DX PDT 250G ») et médiane des prix de référence.
 */

export type ReceiptUnit = "g" | "kg" | "ml" | "cl" | "l" | "piece";
export type PricePerUnitTarget = "kg" | "l" | "piece";

const TO_BASE: Record<ReceiptUnit, { dimension: "mass" | "volume" | "count"; factor: number }> = {
  g: { dimension: "mass", factor: 0.001 },
  kg: { dimension: "mass", factor: 1 },
  ml: { dimension: "volume", factor: 0.001 },
  cl: { dimension: "volume", factor: 0.01 },
  l: { dimension: "volume", factor: 1 },
  piece: { dimension: "count", factor: 1 },
};

const TARGET_DIMENSION = { kg: "mass", l: "volume", piece: "count" } as const;

/**
 * Prix par kg, litre ou pièce d'une ligne (montant payé ÷ quantité convertie).
 * Null si l'unité ne correspond pas (des grammes pour un ingrédient compté à la pièce) ou si
 * une valeur manque. Arrondi au centime.
 */
export function pricePerReferenceUnit(
  line: { quantity: number | null; unit: ReceiptUnit | string | null; totalPrice: number | null },
  target: PricePerUnitTarget,
): number | null {
  if (line.quantity === null || line.totalPrice === null || !line.unit) return null;
  if (!(line.quantity > 0) || !(line.totalPrice > 0)) return null;
  const base = TO_BASE[line.unit as ReceiptUnit];
  if (!base || base.dimension !== TARGET_DIMENSION[target]) return null;
  const amount = line.quantity * base.factor;
  return Math.round((line.totalPrice / amount) * 100) / 100;
}

/** Clé d'un libellé de ticket : majuscules sans accents, espaces et ponctuation réduits. */
export function receiptLabelKey(label: string): string {
  return label
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toUpperCase()
    .replace(/[^A-Z0-9%,.]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Clé d'un magasin : « Carrefour Market Lyon 3 » et « CARREFOUR MARKET » → « CARREFOUR MARKET LYON 3 ». */
export function storeKey(store: string | null | undefined): string {
  return store ? receiptLabelKey(store) : "";
}

/** Médiane (prix de référence : une valeur aberrante ne la déplace pas). */
export function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2;
}
