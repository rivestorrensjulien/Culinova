/**
 * Script TikTok d'une recette (prompt social.generate@3 et suivants : « Accroche (0-3 s) : … »,
 * puis « Plan 1 : … », « Plan 2 : … ») transformé en textes à l'écran pour la vidéo.
 */
export interface VideoScript {
  hook: string;
  shots: string[];
}

/** Retire les consignes de tournage qui n'ont pas leur place à l'écran (« et inviter à enregistrer… »). */
function onScreen(text: string): string {
  return text
    .replace(/\s*(?:,|et|puis|—|-)\s+(?:inviter|invite|inviting|invite viewers)\b.*$/i, "")
    .replace(/\s+/g, " ")
    .replace(/[.;:,\s]+$/, "")
    .trim();
}

export function parseVideoScript(script: string | null | undefined): VideoScript | null {
  if (!script) return null;
  const lines = script
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const hookLine = lines.find((line) => /^(accroche|hook)\b/i.test(line));
  const shots = lines
    .map((line) => /^(?:plan|shot|scene|scène)\s*\d+\s*(?:\([^)]*\))?\s*:\s*(.+)$/i.exec(line)?.[1])
    .filter((text): text is string => Boolean(text))
    .map(onScreen)
    .filter(Boolean);
  const hook = hookLine ? onScreen(hookLine.replace(/^[^:]*:\s*/, "")) : "";
  if (!hook || shots.length === 0) return null;
  return { hook, shots: shots.slice(0, 8) };
}
