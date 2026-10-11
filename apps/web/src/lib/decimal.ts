/** Lecture des nombres saisis (virgule ou point décimal), utilisable côté client et serveur. */

/** Nombre décimal positif ou nul, ou null si la saisie est vide ou invalide. */
export function readDecimal(input: string | number | null | undefined): number | null {
  if (input === null || input === undefined) return null;
  const text = String(input).trim().replace(/\s/g, "").replace(",", ".");
  if (!/^\d+(\.\d+)?$/.test(text)) return null;
  const value = Number(text);
  return Number.isFinite(value) ? value : null;
}

/** Montant en euros saisi (« 15 », « 14,90 ») converti en centimes entiers. */
export function readEurosToCents(input: string | number | null | undefined): number | null {
  const value = readDecimal(input);
  return value === null ? null : Math.round(value * 100);
}

/** Centimes → saisie en euros (« 14,90 »), pour préremplir un champ. */
export function centsToInput(cents: number | null | undefined): string {
  if (cents === null || cents === undefined) return "";
  return (cents / 100).toFixed(2).replace(".", ",");
}

/** Nombre → saisie (« 3,5 »), sans zéros inutiles. */
export function numberToInput(value: number | null | undefined): string {
  if (value === null || value === undefined) return "";
  return String(Number(value.toFixed(4))).replace(".", ",");
}
