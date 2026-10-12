/** Documents juridiques : champs de l'éditeur et documents restant à accepter (logique pure). */

export const LEGAL_IDENTITY_FIELDS = [
  { key: "nom", label: "Nom ou raison sociale", hint: "Prénom et nom, ou dénomination (ex. : Culinova SAS)" },
  {
    key: "forme",
    label: "Statut juridique",
    hint: "Ex. : entrepreneur individuel, SAS au capital de 1 000 €",
  },
  { key: "adresse", label: "Adresse postale", hint: "Adresse du siège ou de domiciliation" },
  { key: "siret", label: "SIRET ou RCS", hint: "Ex. : 123 456 789 00012" },
  {
    key: "tva",
    label: "TVA intracommunautaire",
    hint: "Facultatif : « non applicable » si franchise de TVA",
  },
  { key: "email", label: "E-mail de contact", hint: "Adresse pour les demandes et l’exercice des droits" },
  { key: "directeur", label: "Directeur·rice de la publication", hint: "Personne responsable du contenu" },
] as const;

export type LegalIdentityKey = (typeof LEGAL_IDENTITY_FIELDS)[number]["key"];
export type LegalIdentity = Partial<Record<LegalIdentityKey, string>>;

export const MISSING_LEGAL_VALUE = "[à compléter]";

/** Lit l'identité enregistrée (données non fiables). */
export function parseLegalIdentity(value: unknown): LegalIdentity {
  if (typeof value !== "object" || value === null) return {};
  const identity: LegalIdentity = {};
  for (const { key } of LEGAL_IDENTITY_FIELDS) {
    const raw = (value as Record<string, unknown>)[key];
    if (typeof raw === "string" && raw.trim()) identity[key] = raw.trim().slice(0, 300);
  }
  return identity;
}

/** Remplace les champs {{editeur.…}} d'un texte ; un champ vide est signalé « [à compléter] ». */
export function fillLegalPlaceholders(markdown: string, identity: LegalIdentity): string {
  return markdown.replace(/\{\{editeur\.([a-z]+)\}\}/g, (_, key: string) => {
    const value = identity[key as LegalIdentityKey];
    // Les caractères de mise en forme saisis ne doivent pas casser le texte.
    return value ? value.replace(/([*_`[\]|\\])/g, "\\$1") : MISSING_LEGAL_VALUE;
  });
}

/** Champs encore vides de l'identité de l'éditeur. */
export function missingLegalFields(identity: LegalIdentity): LegalIdentityKey[] {
  return LEGAL_IDENTITY_FIELDS.map((f) => f.key).filter((key) => key !== "tva" && !identity[key]);
}

export interface CurrentDocument {
  id: string;
  type: string;
}

/**
 * Documents en vigueur à faire accepter : ceux dont la personne a accepté une
 * version précédente, mais pas la version actuelle.
 */
export function pendingDocuments<T extends CurrentDocument>(
  current: T[],
  consents: Array<{ legalDocumentId: string; type: string }>,
): T[] {
  return current.filter(
    (doc) => consents.some((c) => c.type === doc.type) && !consents.some((c) => c.legalDocumentId === doc.id),
  );
}
