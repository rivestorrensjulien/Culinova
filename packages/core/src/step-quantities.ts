/**
 * Quantités citées dans le texte des étapes. Le texte n'écrit jamais un nombre
 * en dur : il contient des jetons qui renvoient à un ingrédient, recalculés au
 * nombre de personnes affiché. « {{i3}} » vaut la quantité totale de
 * l'ingrédient i3 ; « {{i3:50}} » en vaut une partie, 50 dans l'unité interne
 * de l'ingrédient (g, ml ou pièces). À l'enregistrement, la référence courte
 * (i3) est remplacée par l'identifiant de la ligne d'ingrédient.
 */

const TOKEN = /\{\{\s*([A-Za-z0-9_-]+)\s*(?::\s*(\d+(?:[.,]\d+)?)\s*)?\}\}/g;

export interface StepQuantityToken {
  ref: string;
  /** Quantité partielle en unité interne, ou null pour la quantité totale. */
  part: number | null;
}

/** Jetons présents dans un texte, dans l'ordre. */
export function parseStepQuantityTokens(text: string): StepQuantityToken[] {
  return [...text.matchAll(TOKEN)].map((match) => ({
    ref: match[1]!,
    part: match[2] === undefined ? null : Number(match[2].replace(",", ".")),
  }));
}

/** Remplace les références des jetons (ex. i3 → identifiant de ligne) ; les inconnues sont gardées. */
export function remapStepQuantityTokens(text: string, map: ReadonlyMap<string, string>): string {
  return text.replace(TOKEN, (whole, ref: string, part: string | undefined) => {
    const target = map.get(ref);
    if (!target) return whole;
    return part === undefined ? `{{${target}}}` : `{{${target}:${part}}}`;
  });
}

export type StepTextSegment =
  | { kind: "text"; text: string }
  | { kind: "quantity"; ref: string; part: number | null };

/** Découpe un texte d'étape en morceaux de texte et de quantités, pour l'affichage. */
export function splitStepText(text: string): StepTextSegment[] {
  const segments: StepTextSegment[] = [];
  let last = 0;
  for (const match of text.matchAll(TOKEN)) {
    const start = match.index;
    if (start > last) segments.push({ kind: "text", text: text.slice(last, start) });
    segments.push({
      kind: "quantity",
      ref: match[1]!,
      part: match[2] === undefined ? null : Number(match[2].replace(",", ".")),
    });
    last = start + match[0].length;
  }
  if (last < text.length) segments.push({ kind: "text", text: text.slice(last) });
  return segments;
}
