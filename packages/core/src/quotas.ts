/**
 * Quotas (logique pure, sans base de données).
 *
 * - Les compteurs mensuels repartent à zéro le 1er du mois, à minuit heure de Paris.
 * - Les régénérations de texte se comptent par recette, sans remise à zéro.
 * - Limite effective = exception de l'utilisateur, sinon valeur de l'offre,
 *   sinon valeur par défaut. `null` = illimité (ex. administrateurs).
 */

export const QUOTA_METRICS = ["recipes", "images", "regenerations"] as const;
export type QuotaMetric = (typeof QUOTA_METRICS)[number];

/** Métriques comptées par mois (les autres le sont par recette). */
export const MONTHLY_METRICS = ["recipes", "images"] as const satisfies readonly QuotaMetric[];

export type QuotaLimits = Record<QuotaMetric, number | null>;
export type QuotaOverrides = Partial<QuotaLimits>;

/** Quotas par défaut de la V1 (modifiables depuis l'admin). */
export const DEFAULT_QUOTAS: QuotaLimits = {
  recipes: 5,
  images: 10,
  regenerations: 2,
};

/** Période des compteurs « à vie » (régénérations par recette). */
export const LIFETIME_PERIOD = "lifetime";

export const QUOTA_TIME_ZONE = "Europe/Paris";

export function isMonthlyMetric(metric: QuotaMetric): boolean {
  return (MONTHLY_METRICS as readonly QuotaMetric[]).includes(metric);
}

/** Année et mois (1-12) d'une date, vus depuis un fuseau horaire. */
function yearMonthIn(date: Date, timeZone: string): { year: number; month: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "numeric",
  }).formatToParts(date);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  return { year: get("year"), month: get("month") };
}

/** Clé de période mensuelle, ex. « 2026-10 ». */
export function monthlyPeriod(date: Date, timeZone = QUOTA_TIME_ZONE): string {
  const { year, month } = yearMonthIn(date, timeZone);
  return `${year}-${String(month).padStart(2, "0")}`;
}

/** Période à utiliser pour une métrique donnée. */
export function periodFor(metric: QuotaMetric, date: Date, timeZone = QUOTA_TIME_ZONE): string {
  return isMonthlyMetric(metric) ? monthlyPeriod(date, timeZone) : LIFETIME_PERIOD;
}

/** Date (année, mois, jour) de la prochaine remise à zéro : le 1er du mois suivant. */
export function nextResetDate(
  date: Date,
  timeZone = QUOTA_TIME_ZONE,
): { year: number; month: number; day: 1 } {
  const { year, month } = yearMonthIn(date, timeZone);
  return month === 12 ? { year: year + 1, month: 1, day: 1 } : { year, month: month + 1, day: 1 };
}

function isValidLimit(value: unknown): value is number | null {
  return value === null || (typeof value === "number" && Number.isInteger(value) && value >= 0);
}

/**
 * Calcule les limites effectives. Chaque niveau ne remplace que les métriques
 * qu'il précise ; les valeurs invalides sont ignorées.
 */
export function resolveQuotaLimits(...layers: Array<QuotaOverrides | null | undefined>): QuotaLimits {
  const limits: QuotaLimits = { ...DEFAULT_QUOTAS };
  for (const layer of layers) {
    if (!layer) continue;
    for (const metric of QUOTA_METRICS) {
      const value = layer[metric];
      if (value !== undefined && isValidLimit(value)) limits[metric] = value;
    }
  }
  return limits;
}

/** Lit des exceptions de quotas stockées en JSON (données non fiables). */
export function parseQuotaOverrides(value: unknown): QuotaOverrides {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return {};
  const result: QuotaOverrides = {};
  for (const metric of QUOTA_METRICS) {
    const raw = (value as Record<string, unknown>)[metric];
    if (raw !== undefined && isValidLimit(raw)) result[metric] = raw;
  }
  return result;
}

export interface QuotaDecision {
  allowed: boolean;
  /** Utilisation avant l'opération. */
  used: number;
  limit: number | null;
  /** Reste disponible avant l'opération (null = illimité). */
  remaining: number | null;
}

/** Une opération consommant `amount` unités est-elle autorisée ? */
export function checkQuota(used: number, limit: number | null, amount = 1): QuotaDecision {
  if (!Number.isInteger(used) || used < 0) throw new RangeError(`Utilisation invalide : ${used}`);
  if (!Number.isInteger(amount) || amount <= 0) throw new RangeError(`Quantité invalide : ${amount}`);
  if (limit === null) return { allowed: true, used, limit, remaining: null };
  const remaining = Math.max(0, limit - used);
  return { allowed: amount <= remaining, used, limit, remaining };
}

/**
 * Plafond de budget IA global (en micro-dollars : 1 $ = 1 000 000).
 * Une génération est refusée si la dépense du mois, augmentée de son coût
 * estimé, dépasse le plafond. Un plafond `null` signifie « pas de plafond ».
 */
export function isWithinBudget(spentMicros: number, capMicros: number | null, estimatedMicros = 0): boolean {
  if (capMicros === null) return true;
  return spentMicros + estimatedMicros <= capMicros;
}
