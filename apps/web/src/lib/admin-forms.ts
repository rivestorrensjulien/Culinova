/** Lecture des champs des formulaires d'administration (quotas, budget IA). */
import { QUOTA_METRICS, type QuotaMetric } from "@culinova/core";

export type FieldRead<T> = { ok: true; value: T } | { ok: false };

/** Limite saisie : vide = null (sans limite ou valeur par défaut), sinon entier de 0 à 10 000. */
export function readLimit(raw: FormDataEntryValue | null | undefined): FieldRead<number | null> {
  const text = typeof raw === "string" ? raw.trim() : "";
  if (text === "") return { ok: true, value: null };
  if (!/^\d+$/.test(text)) return { ok: false };
  const value = Number(text);
  return value <= 10_000 ? { ok: true, value } : { ok: false };
}

/** Lit les trois quotas d'un formulaire (champs `recipes`, `images`, `regenerations`). */
export function readQuotaForm(
  form: FormData,
): { ok: true; value: Record<QuotaMetric, number | null> } | { ok: false; field: QuotaMetric } {
  const value = {} as Record<QuotaMetric, number | null>;
  for (const metric of QUOTA_METRICS) {
    const read = readLimit(form.get(metric));
    if (!read.ok) return { ok: false, field: metric };
    value[metric] = read.value;
  }
  return { ok: true, value };
}

/** Exceptions personnelles : seuls les champs remplis sont gardés (vide = valeur par défaut). */
export function overridesFrom(
  values: Record<QuotaMetric, number | null>,
): Partial<Record<QuotaMetric, number>> {
  const overrides: Partial<Record<QuotaMetric, number>> = {};
  for (const metric of QUOTA_METRICS) {
    const value = values[metric];
    if (value !== null) overrides[metric] = value;
  }
  return overrides;
}

/** Montant en dollars (« 50 », « 12,5 ») → micro-dollars ; vide = pas de plafond. */
export function readUsdToMicros(raw: FormDataEntryValue | null | undefined): FieldRead<number | null> {
  const text = typeof raw === "string" ? raw.trim().replace(/\s/g, "").replace(",", ".") : "";
  if (text === "") return { ok: true, value: null };
  if (!/^\d+(\.\d{1,2})?$/.test(text)) return { ok: false };
  const value = Math.round(Number(text) * 1_000_000);
  return value <= 1_000_000 * 100_000 ? { ok: true, value } : { ok: false };
}

/** Micro-dollars → saisie (« 12,5 »). */
export function microsToInput(micros: number | null): string {
  if (micros === null) return "";
  return String(Number((micros / 1_000_000).toFixed(2))).replace(".", ",");
}
