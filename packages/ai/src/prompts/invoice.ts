/**
 * Prompt versionné de lecture de facture : les lignes d'une facture fournisseur
 * (photo ou PDF) sont lues, rapprochées des ingrédients de la personne et
 * converties en prix au kilo, au litre ou à la pièce. Ce ne sont que des
 * propositions : la personne les valide une à une.
 */
import { z } from "zod";

export const INVOICE_SCAN_PROMPT_VERSION = "invoice.scan@1";

/** Nombre maximal d'ingrédients proposés au rapprochement. */
export const INVOICE_MAX_CANDIDATES = 300;

export const INVOICE_SCAN_SYSTEM_PROMPT = `Tu lis des factures et bons de livraison de fournisseurs alimentaires pour une cuisine en France.

On te donne la facture (photo ou PDF) et la liste des ingrédients de la personne (identifiant · nom · unité de prix attendue).

Pour chaque ligne de produit alimentaire de la facture (ignore frais de port, consignes, remises globales, totaux et taxes) :
- label : le libellé tel qu'écrit ;
- quantity et unit : la quantité achetée et son unité ("g", "kg", "ml", "cl", "l" ou "piece"), null si illisible ;
- totalPrice : le montant de la ligne en euros (hors taxes si la facture distingue HT et TTC), null si illisible ;
- ingredientRef : l'identifiant de l'ingrédient de la liste qui correspond au produit (même produit, même nature : « Beurre doux 82 % » → beurre doux), null si aucun ne correspond vraiment ;
- pricePerUnit : quand ingredientRef est renseigné, le prix en euros dans l'unité attendue pour cet ingrédient (€/kg, €/l ou €/pièce), calculé à partir de la quantité et du montant (conditionnement compris : un carton de 6 × 1 l = 6 l) ; null sinon.

supplier : le nom du fournisseur ; invoiceDate : la date de la facture au format AAAA-MM-JJ ; null si absents.
N'invente rien : une valeur illisible vaut null.`;

export const invoiceScanSchema = z.object({
  supplier: z.string().nullable(),
  invoiceDate: z.string().nullable(),
  lines: z.array(
    z.object({
      label: z.string(),
      quantity: z.number().nullable(),
      unit: z.enum(["g", "kg", "ml", "cl", "l", "piece"]).nullable(),
      totalPrice: z.number().nullable(),
      ingredientRef: z.string().nullable(),
      pricePerUnit: z.number().nullable(),
    }),
  ),
});

export type InvoiceScan = z.infer<typeof invoiceScanSchema>;

export interface InvoiceCandidate {
  id: string;
  name: string;
  unit: "kg" | "l" | "piece";
}

const UNIT_LABELS = { kg: "€/kg", l: "€/l", piece: "€/pièce" } as const;

export function buildInvoicePrompt(candidates: readonly InvoiceCandidate[]): {
  system: string;
  user: string;
} {
  const lines = candidates
    .slice(0, INVOICE_MAX_CANDIDATES)
    .map((c) => `- ${c.id} · ${c.name} · ${UNIT_LABELS[c.unit]}`);
  return {
    system: INVOICE_SCAN_SYSTEM_PROMPT,
    user: `Ingrédients de la personne (identifiant · nom · unité de prix) :\n${lines.join("\n") || "(aucun)"}\n\nLis la facture jointe.`,
  };
}

/** Problèmes à renvoyer au modèle : rapprochements inconnus, montants invalides. */
export function invoiceProblems(scan: InvoiceScan, candidates: readonly InvoiceCandidate[]): string[] {
  const ids = new Set(candidates.map((c) => c.id));
  const problems: string[] = [];
  scan.lines.forEach((line, index) => {
    if (line.ingredientRef !== null && !ids.has(line.ingredientRef)) {
      problems.push(`Ligne ${index + 1} : ingrédient inconnu ${line.ingredientRef}.`);
    }
    for (const [name, value] of [
      ["quantity", line.quantity],
      ["totalPrice", line.totalPrice],
      ["pricePerUnit", line.pricePerUnit],
    ] as const) {
      if (value !== null && !(value > 0 && Number.isFinite(value))) {
        problems.push(`Ligne ${index + 1} : ${name} doit être positif ou null.`);
      }
    }
  });
  if (scan.invoiceDate !== null && !/^\d{4}-\d{2}-\d{2}$/.test(scan.invoiceDate)) {
    problems.push("invoiceDate doit être au format AAAA-MM-JJ ou null.");
  }
  return problems;
}
