/** Date de remise à zéro des quotas (toujours le 1er du mois) : « 1er novembre 2026 » / « November 1, 2026 ». */
export function formatResetDate(resetsOn: { year: number; month: number }, locale: string): string {
  const date = new Date(Date.UTC(resetsOn.year, resetsOn.month - 1, 1, 12));
  if (locale === "fr") {
    return `1er ${new Intl.DateTimeFormat("fr-FR", { month: "long", year: "numeric", timeZone: "Europe/Paris" }).format(date)}`;
  }
  return new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Europe/Paris",
  }).format(date);
}
