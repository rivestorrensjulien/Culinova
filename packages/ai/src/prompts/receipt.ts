/**
 * Prompt versionné de lecture de ticket de caisse (P8, particuliers) : libellés abrégés des
 * enseignes, produits pesés, lots, remises. Chaque ligne alimentaire est rapprochée d'un
 * ingrédient de la personne et convertie en prix au kilo, au litre ou à la pièce.
 * Ce ne sont que des propositions : la personne valide.
 */
import { z } from "zod";
import { type InvoiceCandidate, INVOICE_MAX_CANDIDATES } from "./invoice";

export const RECEIPT_SCAN_PROMPT_VERSION = "receipt.scan@1";

export const RECEIPT_SCAN_SYSTEM_PROMPT = `Tu lis des tickets de caisse de supermarchés et commerces alimentaires en France (Carrefour, E.Leclerc, Intermarché, Auchan, Lidl, Aldi, Monoprix, Casino, Super U, Franprix, marchés, boulangeries…).

On te donne la photo du ticket et la liste des ingrédients de la personne (identifiant · nom · unité de prix attendue).

Les libellés sont abrégés et en majuscules : « BEUR DX PDT 250G » = beurre doux Président 250 g, « OEUFS PA X12 » = 12 œufs de poules élevées en plein air, « LT 1/2 ECR UHT 1L » = lait demi-écrémé 1 l, « CREME FR EP 30% 20CL » = crème fraîche épaisse 20 cl, « FAR BLE T45 1KG » = farine de blé T45 1 kg.

Pour chaque produit ALIMENTAIRE acheté (boissons comprises) :
- label : le libellé tel qu'écrit sur le ticket ;
- name : le nom courant du produit en français, générique et sans marque, au singulier sauf usage (« Beurre doux », « Œufs », « Lait demi-écrémé », « Tomates cerises ») ;
- quantity et unit : la quantité totale achetée ("g", "kg", "ml", "cl", "l" ou "piece"), lue dans le libellé ou la ligne (poids du paquet, contenance, « X12 », « 6X1L » = 6 l), multipliée par le nombre d'articles (« 2 X 1,29 » → 2 paquets). Produit pesé (« 0,452 kg x 3,99 €/kg ») : le poids pesé. null si vraiment illisible ;
- totalPrice : le montant réellement payé pour la ligne en euros TTC, remises de la ligne déduites (une ligne « REMISE », « PROMO », « -30% IMMEDIAT », « 2E A -50% » sous un produit se déduit de ce produit et n'est PAS une ligne à part) ; null si illisible ;
- promo : true si le prix payé est un prix de promotion (remise déduite, lot promotionnel, prix barré, « 2+1 offert ») ; false sinon. Les avantages fidélité versés sur une carte ou une cagnotte ne changent pas le prix payé : promo false ;
- ingredientRef : l'identifiant de l'ingrédient de la liste qui correspond au produit (même produit, même nature : « Beurre doux 82 % » → beurre doux ; « crème liquide » ≠ « crème épaisse »), null si aucun ne correspond vraiment ;
- pricePerUnit : quand ingredientRef est renseigné, le prix en euros dans l'unité attendue pour cet ingrédient (€/kg, €/l ou €/pièce) = totalPrice ÷ quantité convertie ; null sinon.

Ignore : produits non alimentaires (hygiène, entretien, sacs, journaux), consignes, bons d'achat, cagnottes, sous-totaux, totaux, TVA, moyens de paiement, rendu monnaie.

store : l'enseigne et la ville si écrites (« Carrefour Market Lyon »), sans adresse précise ; receiptDate : la date au format AAAA-MM-JJ ; null si absents.
N'invente rien : une valeur illisible vaut null. Ne recopie jamais un numéro de carte bancaire, de carte de fidélité ni un nom de personne.`;

export const receiptScanSchema = z.object({
  store: z.string().nullable(),
  receiptDate: z.string().nullable(),
  lines: z.array(
    z.object({
      label: z.string(),
      name: z.string(),
      quantity: z.number().nullable(),
      unit: z.enum(["g", "kg", "ml", "cl", "l", "piece"]).nullable(),
      totalPrice: z.number().nullable(),
      promo: z.boolean(),
      ingredientRef: z.string().nullable(),
      pricePerUnit: z.number().nullable(),
    }),
  ),
});

export type ReceiptScan = z.infer<typeof receiptScanSchema>;

const UNIT_LABELS = { kg: "€/kg", l: "€/l", piece: "€/pièce" } as const;

export function buildReceiptPrompt(candidates: readonly InvoiceCandidate[]): {
  system: string;
  user: string;
} {
  const lines = candidates
    .slice(0, INVOICE_MAX_CANDIDATES)
    .map((c) => `- ${c.id} · ${c.name} · ${UNIT_LABELS[c.unit]}`);
  return {
    system: RECEIPT_SCAN_SYSTEM_PROMPT,
    user: `Ingrédients de la personne (identifiant · nom · unité de prix) :\n${lines.join("\n") || "(aucun)"}\n\nLis le ticket de caisse joint.`,
  };
}

/** Problèmes à renvoyer au modèle : rapprochements inconnus, montants invalides, date mal écrite. */
export function receiptProblems(scan: ReceiptScan, candidates: readonly InvoiceCandidate[]): string[] {
  const ids = new Set(candidates.map((c) => c.id));
  const problems: string[] = [];
  scan.lines.forEach((line, index) => {
    if (line.ingredientRef !== null && !ids.has(line.ingredientRef)) {
      problems.push(`Ligne ${index + 1} : ingrédient inconnu ${line.ingredientRef}.`);
    }
    if (!line.name.trim()) problems.push(`Ligne ${index + 1} : name est vide.`);
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
  if (scan.receiptDate !== null && !/^\d{4}-\d{2}-\d{2}$/.test(scan.receiptDate)) {
    problems.push("receiptDate doit être au format AAAA-MM-JJ ou null.");
  }
  return problems;
}
