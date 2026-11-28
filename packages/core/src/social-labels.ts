/**
 * Textes courts des visuels des réseaux (plaquette « Nouveau fil Instagram » validée par Julien
 * le 28/11) : nom court de la couverture (5 mots au plus) et temps lisible (« 1 h 30 »,
 * « 20 min + 2 h au frais ») au lieu de « 88 min » ou « 616 min ».
 */

const STOP_WORDS = new Set([
  "à",
  "a",
  "au",
  "aux",
  "de",
  "des",
  "du",
  "d",
  "d'",
  "et",
  "en",
  "la",
  "le",
  "les",
  "l",
  "l'",
  "sur",
  "avec",
  "sans",
  "pour",
  "façon",
  "with",
  "and",
  "of",
  "the",
  "in",
  "on",
]);

/** Nom de couverture : la partie avant la première virgule, tiret ou parenthèse, 5 mots au plus. */
export function shortDishName(name: string, maxWords = 5): string {
  const clean = name.replace(/\s+/g, " ").trim();
  const head = clean.split(/\s*(?:,|\(|:|\s[–—-]\s|\s\+\s)\s*/)[0]?.trim() || clean;
  let words = head.split(" ").filter(Boolean);
  if (words.length > maxWords) words = words.slice(0, maxWords);
  while (words.length > 1 && STOP_WORDS.has(words[words.length - 1]!.toLowerCase())) words.pop();
  const short = words.join(" ").replace(/[\s,;:.–—-]+$/, "");
  return short.charAt(0).toUpperCase() + short.slice(1);
}

/** « 45 min », « 1 h », « 1 h 30 », « 12 h ». */
export function formatMinutes(minutes: number): string {
  const total = Math.max(0, Math.round(minutes));
  if (total < 60) return `${total} min`;
  const hours = Math.floor(total / 60);
  const rest = total % 60;
  // Au-delà de 3 h, le quart d'heure près suffit.
  const shown = hours >= 3 ? Math.round(rest / 15) * 15 : rest;
  if (shown === 60) return `${hours + 1} h`;
  return shown === 0 ? `${hours} h` : `${hours} h ${String(shown).padStart(2, "0")}`;
}

/**
 * Temps affiché : travail (préparation + cuisson) et, s'il y a une longue attente, sa nature
 * devinée d'après les étapes (trempage, au frais, sinon repos). Une attente de 6 h et plus
 * devient « la veille ».
 */
export function readableRecipeTime(input: {
  prepMinutes: number;
  cookMinutes: number;
  restMinutes: number;
  steps?: string[];
}): string {
  const work = Math.max(0, input.prepMinutes) + Math.max(0, input.cookMinutes);
  const rest = Math.max(0, input.restMinutes);
  if (rest < 30) return formatMinutes(work + rest);
  const text = (input.steps ?? []).join(" ").toLowerCase();
  const kind = /tremp/.test(text)
    ? "trempage"
    : /réfrig|refrig|au frais|frigo|congél|congel/.test(text)
      ? "au frais"
      : /lev[eé]e|pousse|lever\b/.test(text)
        ? "levée"
        : "repos";
  const workText = formatMinutes(Math.max(work, 5));
  if (rest >= 6 * 60) return `${workText} + ${kind === "repos" ? "repos" : kind} la veille`;
  const restText = formatMinutes(rest);
  if (kind === "au frais") return `${workText} + ${restText} au frais`;
  if (kind === "repos") return `${workText} + ${restText} de repos`;
  return `${workText} + ${restText} de ${kind}`;
}
