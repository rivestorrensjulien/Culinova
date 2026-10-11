/**
 * Prompt versionné d'estimation des prix d'achat des ingrédients. Ce ne sont que
 * des propositions : la personne les valide ou les corrige avant tout enregistrement.
 */
import { z } from "zod";

export const PRICE_ESTIMATE_PROMPT_VERSION = "prices.estimate@1";

/** Nombre maximal d'ingrédients estimés en une fois. */
export const PRICE_ESTIMATE_MAX_ITEMS = 40;

export const PRICE_ESTIMATE_SYSTEM_PROMPT = `Tu es acheteur pour une cuisine professionnelle en France. On te donne une liste d'ingrédients et, pour chacun, l'unité de prix attendue (€/kg, €/l ou €/pièce).

Pour chaque ingrédient, estime un prix d'achat moyen réaliste en France aujourd'hui, en euros TTC, pour un produit de qualité courante acheté en grande surface ou chez un grossiste, dans l'unité demandée :
- €/kg : prix d'un kilo (ex. farine de blé T55 ≈ 1,20 €/kg ; beurre doux ≈ 10 €/kg ; filet de saumon frais ≈ 25 €/kg) ;
- €/l : prix d'un litre (ex. lait demi-écrémé ≈ 1,10 €/l ; huile d'olive vierge extra ≈ 10 €/l) ;
- €/pièce : prix d'une pièce (ex. œuf ≈ 0,30 € ; citron jaune ≈ 0,50 €).
Pour une épice, une herbe ou un produit vendu en petit conditionnement, ramène toujours le prix à l'unité demandée (ex. cannelle moulue vendue 2 € les 40 g → 50 €/kg).

Réponds pour chaque identifiant reçu, sans en inventer ni en oublier. price est un nombre positif (2 décimales au plus). confidence vaut "high" pour un produit courant au prix stable, "medium" sinon, "low" pour un produit rare ou très variable. note est une précision courte et utile (conditionnement de référence, saison) ou null.`;

export const priceEstimateSchema = z.object({
  estimates: z.array(
    z.object({
      id: z.string(),
      price: z.number(),
      confidence: z.enum(["high", "medium", "low"]),
      note: z.string().nullable(),
    }),
  ),
});

export type PriceEstimate = z.infer<typeof priceEstimateSchema>["estimates"][number];

export interface PriceEstimateItem {
  id: string;
  name: string;
  unit: "kg" | "l" | "piece";
}

const UNIT_LABELS = { kg: "€/kg", l: "€/l", piece: "€/pièce" } as const;

export function buildPriceEstimatePrompt(items: readonly PriceEstimateItem[]): {
  system: string;
  user: string;
} {
  const lines = items.map((item) => `- ${item.id} · ${item.name} · ${UNIT_LABELS[item.unit]}`);
  return {
    system: PRICE_ESTIMATE_SYSTEM_PROMPT,
    user: `Ingrédients à estimer (identifiant · nom · unité) :\n${lines.join("\n")}`,
  };
}

/** Problèmes à renvoyer au modèle : identifiants manquants ou inconnus, prix invalides. */
export function priceEstimateProblems(
  data: z.infer<typeof priceEstimateSchema>,
  items: readonly PriceEstimateItem[],
): string[] {
  const expected = new Set(items.map((i) => i.id));
  const seen = new Set<string>();
  const problems: string[] = [];
  for (const estimate of data.estimates) {
    if (!expected.has(estimate.id)) problems.push(`Identifiant inconnu : ${estimate.id}.`);
    if (seen.has(estimate.id)) problems.push(`Identifiant en double : ${estimate.id}.`);
    seen.add(estimate.id);
    if (!(estimate.price > 0) || !Number.isFinite(estimate.price)) {
      problems.push(`Prix invalide pour ${estimate.id} : ${estimate.price}.`);
    }
  }
  for (const id of expected) if (!seen.has(id)) problems.push(`Estimation manquante pour ${id}.`);
  return problems;
}
