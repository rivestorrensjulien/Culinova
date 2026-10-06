/**
 * Unités de mesure.
 *
 * Règle du projet : tous les calculs se font en unités internes
 * (grammes, millilitres, pièces, °C, secondes). Les autres unités
 * ne servent qu'à la saisie et à l'affichage.
 */

export type Dimension = "mass" | "volume" | "count";

/** Unité interne de chaque dimension. */
export const BASE_UNIT = {
  mass: "g",
  volume: "ml",
  count: "piece",
} as const satisfies Record<Dimension, Unit>;

interface UnitDefinition {
  dimension: Dimension;
  /** Nombre d'unités internes (g, ml ou pièces) contenues dans une unité. */
  factor: number;
}

const UNITS = {
  mg: { dimension: "mass", factor: 0.001 },
  g: { dimension: "mass", factor: 1 },
  kg: { dimension: "mass", factor: 1000 },
  ml: { dimension: "volume", factor: 1 },
  cl: { dimension: "volume", factor: 10 },
  dl: { dimension: "volume", factor: 100 },
  l: { dimension: "volume", factor: 1000 },
  /** Cuillère à café (5 ml). */
  tsp: { dimension: "volume", factor: 5 },
  /** Cuillère à soupe (15 ml). */
  tbsp: { dimension: "volume", factor: 15 },
  piece: { dimension: "count", factor: 1 },
} as const satisfies Record<string, UnitDefinition>;

export type Unit = keyof typeof UNITS;

export const ALL_UNITS = Object.keys(UNITS) as Unit[];

export function isUnit(value: string): value is Unit {
  return Object.hasOwn(UNITS, value);
}

export function dimensionOf(unit: Unit): Dimension {
  return UNITS[unit].dimension;
}

/** Quantité exprimée dans l'unité interne de sa dimension. */
export interface BaseQuantity {
  dimension: Dimension;
  /** Valeur en g, ml ou pièces. */
  value: number;
}

function assertFiniteNonNegative(quantity: number): void {
  if (!Number.isFinite(quantity) || quantity < 0) {
    throw new RangeError(`Quantité invalide : ${quantity}`);
  }
}

/** Convertit une quantité saisie (ex. 1,5 kg) vers l'unité interne (1500 g). */
export function toBase(quantity: number, unit: Unit): BaseQuantity {
  assertFiniteNonNegative(quantity);
  const def = UNITS[unit];
  return { dimension: def.dimension, value: quantity * def.factor };
}

/** Convertit une quantité interne vers une unité d'affichage de la même dimension. */
export function fromBase(base: BaseQuantity, unit: Unit): number {
  const def = UNITS[unit];
  if (def.dimension !== base.dimension) {
    throw new TypeError(`Impossible d'exprimer une quantité de type ${base.dimension} en ${unit}`);
  }
  return base.value / def.factor;
}

/** Convertit entre deux unités d'une même dimension (ex. cl → l). */
export function convert(quantity: number, from: Unit, to: Unit): number {
  return fromBase(toBase(quantity, from), to);
}

/**
 * Convertit un volume en masse grâce à la densité (g/ml) de l'ingrédient.
 * Exemple : 100 ml de lait (densité 1,03) = 103 g.
 */
export function volumeToMass(milliliters: number, densityGramsPerMl: number): number {
  assertFiniteNonNegative(milliliters);
  if (!Number.isFinite(densityGramsPerMl) || densityGramsPerMl <= 0) {
    throw new RangeError(`Densité invalide : ${densityGramsPerMl}`);
  }
  return milliliters * densityGramsPerMl;
}

/**
 * Choisit l'unité la plus lisible pour l'affichage
 * (1500 g → kg, 250 g → g, 0,5 g → mg, 1200 ml → l…).
 */
export function bestDisplayUnit(base: BaseQuantity): Unit {
  const { dimension, value } = base;
  if (dimension === "mass") {
    if (value >= 1000) return "kg";
    if (value > 0 && value < 1) return "mg";
    return "g";
  }
  if (dimension === "volume") {
    if (value >= 1000) return "l";
    if (value >= 100 && value % 10 === 0) return "cl";
    return "ml";
  }
  return "piece";
}
