/**
 * Prix de vente et marges (outils d'aide à la gestion, pas une garantie de prix optimal).
 *
 * Vocabulaire :
 * - coefficient multiplicateur = prix de vente HT ÷ coût
 * - marge brute = prix de vente HT − coût
 * - taux de marge = marge brute ÷ coût
 * - taux de marque = marge brute ÷ prix de vente HT
 */
import { assertCents, divRound } from "./money";

/** Précision des taux et coefficients (4 décimales). */
const RATE_SCALE = 10_000;

function scaled(value: number, label: string): bigint {
  if (!Number.isFinite(value) || value < 0) throw new RangeError(`${label} invalide : ${value}`);
  return BigInt(Math.round(value * RATE_SCALE));
}

/** Prix de vente HT conseillé = coût × coefficient. */
export function priceFromCoefficient(costCents: number, coefficient: number): number {
  assertCents(costCents);
  return Number(divRound(BigInt(costCents) * scaled(coefficient, "Coefficient"), BigInt(RATE_SCALE)));
}

/** Ajoute la TVA (taux en %, ex. 10 ou 5.5) à un prix HT. */
export function addVat(priceExclTaxCents: number, vatRatePercent: number): number {
  assertCents(priceExclTaxCents);
  const rate = scaled(vatRatePercent / 100, "Taux de TVA");
  return Number(divRound(BigInt(priceExclTaxCents) * (BigInt(RATE_SCALE) + rate), BigInt(RATE_SCALE)));
}

/** Retire la TVA (taux en %) d'un prix TTC. */
export function removeVat(priceInclTaxCents: number, vatRatePercent: number): number {
  assertCents(priceInclTaxCents);
  const rate = scaled(vatRatePercent / 100, "Taux de TVA");
  return Number(divRound(BigInt(priceInclTaxCents) * BigInt(RATE_SCALE), BigInt(RATE_SCALE) + rate));
}

export interface MarginAnalysis {
  /** Marge brute, en centimes. */
  grossMarginCents: number;
  /** Taux de marge (ratio, 2 = 200 %), ou null si le coût est nul. */
  marginRate: number | null;
  /** Taux de marque (ratio, 0,7 = 70 %), ou null si le prix est nul. */
  markupRate: number | null;
  /** Coefficient multiplicateur réel, ou null si le coût est nul. */
  coefficient: number | null;
}

export function analyzeMargin(costCents: number, priceExclTaxCents: number): MarginAnalysis {
  assertCents(costCents);
  assertCents(priceExclTaxCents);
  const grossMarginCents = priceExclTaxCents - costCents;
  return {
    grossMarginCents,
    marginRate: costCents === 0 ? null : grossMarginCents / costCents,
    markupRate: priceExclTaxCents === 0 ? null : grossMarginCents / priceExclTaxCents,
    coefficient: costCents === 0 ? null : priceExclTaxCents / costCents,
  };
}

export interface SuggestedPrice {
  priceExclTaxCents: number;
  priceInclTaxCents: number;
  margin: MarginAnalysis;
}

/** Prix conseillé HT et TTC à partir du coût, du coefficient et du taux de TVA. */
export function suggestPrice(costCents: number, coefficient: number, vatRatePercent: number): SuggestedPrice {
  const priceExclTaxCents = priceFromCoefficient(costCents, coefficient);
  return {
    priceExclTaxCents,
    priceInclTaxCents: addVat(priceExclTaxCents, vatRatePercent),
    margin: analyzeMargin(costCents, priceExclTaxCents),
  };
}
