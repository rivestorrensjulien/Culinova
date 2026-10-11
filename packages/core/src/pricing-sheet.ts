/**
 * Fiche de prix d'une recette : coût de revient (matière, main-d'œuvre, énergie),
 * prix de vente conseillé et marges. Aide à la décision, jamais un prix imposé.
 *
 * Convention de la restauration : le coefficient multiplicateur s'applique au
 * coût matière par portion (prix HT conseillé = coût matière × coefficient).
 * La main-d'œuvre et l'énergie sont comptées pour tout le lot (la recette pour
 * N personnes), puis réparties par portion.
 */
import { energyCostCents, laborCostCents } from "./costs";
import { addVat, analyzeMargin, type MarginAnalysis, priceFromCoefficient, removeVat } from "./margins";
import { assertCents, divRound } from "./money";

export interface PricingSheetInput {
  /** Coût matière du lot (la recette entière), en centimes. */
  materialCents: number;
  /** Nombre de portions du lot. */
  servings: number;
  /** Temps de travail pour le lot, en secondes. */
  laborSeconds: number;
  /** Coût horaire chargé, en centimes (null : main-d'œuvre non comptée). */
  hourlyRateCents: number | null;
  /** Appareils utilisés pour le lot. */
  energy: ReadonlyArray<{ powerW: number; seconds: number }>;
  /** Prix du kWh en centimes (null : énergie non comptée). */
  kwhPriceCents: number | null;
  coefficient: number;
  /** Taux de TVA en % (5,5, 10 ou 20). */
  vatRate: number;
  /** Prix de vente TTC d'une portion (prix de la carte), s'il est fixé (null : seul le prix conseillé est donné). */
  sellingPriceTtcCents: number | null;
}

export interface PortionCosts {
  materialCents: number;
  laborCents: number;
  energyCents: number;
  /** Coût de revient = matière + main-d'œuvre + énergie. */
  totalCents: number;
}

export interface PriceMargins {
  priceExclTaxCents: number;
  priceInclTaxCents: number;
  /** Marge brute, taux de marge, taux de marque et coefficient, sur le coût matière. */
  onMaterial: MarginAnalysis;
  /** Ratio matière = coût matière ÷ prix HT (null si le prix est nul). */
  foodCostRatio: number | null;
  /** Marge après main-d'œuvre et énergie = prix HT − coût de revient. */
  netMarginCents: number;
}

export interface PricingSheet {
  /** Coûts du lot entier. */
  batch: PortionCosts;
  /** Coûts d'une portion. */
  perPortion: PortionCosts;
  laborCounted: boolean;
  energyCounted: boolean;
  /** Prix conseillé (coût matière par portion × coefficient). */
  suggested: PriceMargins;
  /** Prix fixé par la personne, s'il existe. */
  actual: PriceMargins | null;
}

function share(cents: number, servings: number): number {
  return Number(divRound(BigInt(cents), BigInt(servings)));
}

function margins(
  perPortion: PortionCosts,
  priceExclTaxCents: number,
  priceInclTaxCents: number,
): PriceMargins {
  return {
    priceExclTaxCents,
    priceInclTaxCents,
    onMaterial: analyzeMargin(perPortion.materialCents, priceExclTaxCents),
    foodCostRatio: priceExclTaxCents === 0 ? null : perPortion.materialCents / priceExclTaxCents,
    netMarginCents: priceExclTaxCents - perPortion.totalCents,
  };
}

export function pricingSheet(input: PricingSheetInput): PricingSheet {
  assertCents(input.materialCents);
  if (!Number.isInteger(input.servings) || input.servings < 1) {
    throw new RangeError(`Nombre de portions invalide : ${input.servings}`);
  }
  const laborCounted = input.hourlyRateCents !== null && input.laborSeconds > 0;
  const energyCounted = input.kwhPriceCents !== null && input.energy.some((use) => use.seconds > 0);
  const laborCents = laborCounted ? laborCostCents(input.laborSeconds, input.hourlyRateCents!) : 0;
  const energyCents = energyCounted
    ? input.energy.reduce(
        (sum, use) => sum + energyCostCents(use.powerW, use.seconds, input.kwhPriceCents!),
        0,
      )
    : 0;

  const batch: PortionCosts = {
    materialCents: input.materialCents,
    laborCents,
    energyCents,
    totalCents: input.materialCents + laborCents + energyCents,
  };
  const perPortion: PortionCosts = {
    materialCents: share(batch.materialCents, input.servings),
    laborCents: share(batch.laborCents, input.servings),
    energyCents: share(batch.energyCents, input.servings),
    totalCents: 0,
  };
  perPortion.totalCents = perPortion.materialCents + perPortion.laborCents + perPortion.energyCents;

  const suggestedPrice = priceFromCoefficient(perPortion.materialCents, input.coefficient);
  return {
    batch,
    perPortion,
    laborCounted,
    energyCounted,
    suggested: margins(perPortion, suggestedPrice, addVat(suggestedPrice, input.vatRate)),
    // Le prix TTC saisi est gardé tel quel ; le prix HT en est déduit.
    actual:
      input.sellingPriceTtcCents === null
        ? null
        : margins(
            perPortion,
            removeVat(input.sellingPriceTtcCents, input.vatRate),
            input.sellingPriceTtcCents,
          ),
  };
}
