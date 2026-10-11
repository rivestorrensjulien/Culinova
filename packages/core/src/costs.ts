/**
 * Coûts : matière, main-d'œuvre, énergie.
 *
 * Règle du projet : le coût n'est jamais saisi, il est calculé
 * (coût matière = Σ quantité × prix).
 */
import { divRound, type ExactAmount, toCents } from "./money";
import { type BaseQuantity, type Dimension, volumeToMass } from "./units";

/**
 * Prix d'un ingrédient, rapporté à son unité de référence :
 * au kilo (masse), au litre (volume) ou à la pièce.
 */
export interface ReferencePrice {
  dimension: Dimension;
  /** Prix exact en dix-millièmes de centime (voir `parsePrice`). */
  amount: ExactAmount;
}

export interface CostLine {
  /** Quantité utilisée, en unité interne (g, ml ou pièces). */
  quantity: BaseQuantity;
  price: ReferencePrice;
  /** Densité (g/ml), nécessaire si la quantité est en volume et le prix au kilo (ou l'inverse). */
  densityGramsPerMl?: number;
  /** Poids moyen d'une pièce (g), nécessaire si la quantité est en grammes et le prix à la pièce (ou l'inverse). */
  pieceWeightGrams?: number;
}

/** Ramène la quantité dans la dimension du prix (conversion volume ↔ masse via la densité). */
function quantityInPriceDimension(line: CostLine): number {
  const { quantity, price, densityGramsPerMl, pieceWeightGrams } = line;
  if (quantity.dimension === price.dimension) return quantity.value;
  if (pieceWeightGrams !== undefined && pieceWeightGrams > 0) {
    // Grammes ↔ pièces (ex. 150 g d'œufs à 50 g pièce = 3 œufs) ; un volume passe d'abord par la densité.
    if (price.dimension === "count") {
      const grams =
        quantity.dimension === "mass"
          ? quantity.value
          : densityGramsPerMl !== undefined
            ? volumeToMass(quantity.value, densityGramsPerMl)
            : undefined;
      if (grams !== undefined) return grams / pieceWeightGrams;
    }
    if (quantity.dimension === "count" && price.dimension === "mass") {
      return quantity.value * pieceWeightGrams;
    }
  }
  if (densityGramsPerMl !== undefined) {
    if (quantity.dimension === "volume" && price.dimension === "mass") {
      return volumeToMass(quantity.value, densityGramsPerMl);
    }
    if (quantity.dimension === "mass" && price.dimension === "volume") {
      return quantity.value / densityGramsPerMl;
    }
  }
  throw new TypeError(
    `Quantité (${quantity.dimension}) et prix (${price.dimension}) incompatibles` +
      (quantity.dimension === "count" || price.dimension === "count"
        ? pieceWeightGrams === undefined
          ? " : poids à la pièce manquant"
          : ""
        : densityGramsPerMl === undefined
          ? " : densité manquante"
          : ""),
  );
}

/** Coût exact d'une ligne d'ingrédient (non arrondi). */
export function lineCost(line: CostLine): ExactAmount {
  const quantity = quantityInPriceDimension(line);
  // Quantité en millièmes d'unité interne (mg, µl ou millièmes de pièce) pour rester en entiers.
  const milli = BigInt(Math.round(quantity * 1000));
  // Prix au kilo / au litre → 1 000 000 de millièmes ; prix à la pièce → 1 000.
  const divisor = line.price.dimension === "count" ? 1000n : 1_000_000n;
  return divRound(milli * line.price.amount, divisor);
}

export interface MaterialCost {
  /** Coût matière total, en centimes. */
  totalCents: number;
  /** Coût matière par portion, en centimes. */
  perPortionCents: number;
  /** Coût au kilo de préparation finie (si le poids final est connu), en centimes. */
  perKgCents: number | null;
}

/**
 * Coût matière d'une recette. Les lignes sont additionnées au montant exact
 * et l'arrondi au centime n'a lieu qu'une fois, à la fin.
 */
export function materialCost(
  lines: readonly CostLine[],
  portions: number,
  yieldGrams?: number,
): MaterialCost {
  if (!Number.isInteger(portions) || portions <= 0) {
    throw new RangeError(`Nombre de portions invalide : ${portions}`);
  }
  const total = lines.reduce((sum, line) => sum + lineCost(line), 0n);
  let perKgCents: number | null = null;
  if (yieldGrams !== undefined && yieldGrams > 0) {
    perKgCents = toCents(divRound(total * 1000n * 1000n, BigInt(Math.round(yieldGrams * 1000))));
  }
  return {
    totalCents: toCents(total),
    perPortionCents: toCents(divRound(total, BigInt(portions))),
    perKgCents,
  };
}

function assertDuration(seconds: number): void {
  if (!Number.isFinite(seconds) || seconds < 0) throw new RangeError(`Durée invalide : ${seconds}`);
}

/** Coût de main-d'œuvre : durée (secondes) × taux horaire (centimes / heure). */
export function laborCostCents(seconds: number, hourlyRateCents: number): number {
  assertDuration(seconds);
  return Number(divRound(BigInt(Math.round(seconds)) * BigInt(hourlyRateCents), 3600n));
}

/**
 * Coût énergétique d'un appareil : puissance (W) × durée (s) × prix du kWh (centimes).
 * 1 kWh = 3 600 000 W·s.
 */
export function energyCostCents(powerWatts: number, seconds: number, pricePerKwhCents: number): number {
  assertDuration(seconds);
  if (!Number.isFinite(powerWatts) || powerWatts < 0)
    throw new RangeError(`Puissance invalide : ${powerWatts}`);
  const wattSeconds = BigInt(Math.round(powerWatts * seconds));
  return Number(divRound(wattSeconds * BigInt(pricePerKwhCents), 3_600_000n));
}
