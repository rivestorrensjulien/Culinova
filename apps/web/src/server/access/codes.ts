/** Codes d'invitation : génération, normalisation, empreinte. */
import { createHash, randomInt } from "node:crypto";

/** Alphabet sans caractères ambigus (pas de 0/O, 1/I/L). */
const ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
const PREFIX = "CULI";

/** Génère un code du type « CULI-7K3Q-M9XA » (≈ 8,5 × 10¹¹ combinaisons). */
export function generateInvitationCode(): string {
  const block = () => Array.from({ length: 4 }, () => ALPHABET[randomInt(ALPHABET.length)]).join("");
  return `${PREFIX}-${block()}-${block()}`;
}

/**
 * Normalise une saisie : majuscules, sans espaces ni tirets superflus,
 * confusions courantes corrigées (O → 0 n'existe pas : O reste invalide).
 * Renvoie null si la saisie ne peut pas être un code.
 */
export function normalizeInvitationCode(input: string): string | null {
  const compact = input.toUpperCase().replace(/[\s-]/g, "");
  const body = compact.startsWith(PREFIX) ? compact.slice(PREFIX.length) : compact;
  if (body.length !== 8) return null;
  for (const char of body) if (!ALPHABET.includes(char)) return null;
  return `${PREFIX}-${body.slice(0, 4)}-${body.slice(4)}`;
}

/** Empreinte stockée en base (le code n'est jamais conservé en clair). */
export function hashInvitationCode(code: string): string {
  return createHash("sha256").update(`culinova-invitation:${code}`).digest("hex");
}

/** Indice affiché dans l'admin : « CULI-••••-M9XA ». */
export function invitationCodeHint(code: string): string {
  return `${PREFIX}-••••-${code.slice(-4)}`;
}
