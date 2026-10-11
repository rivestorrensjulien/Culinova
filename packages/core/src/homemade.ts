/**
 * Préparations « faites maison » : repérage des produits souvent achetés tout
 * prêts, et calcul de l'heure de départ conseillée d'une base préparée en amont.
 */

/**
 * Produits souvent achetés tout prêts mais réalisables à la maison. Sert de repli
 * pour les recettes générées avant que l'IA ne les signale elle-même.
 */
const STORE_BOUGHT_PATTERN = new RegExp(
  [
    "pains? (bao|burger|hamburger|brioch\\w*|de mie|pita|naan|à hot-dog)",
    "p[âa]tes? (feuillet[ée]e|bris[ée]e|sabl[ée]e|à pizza|filo|phyllo|à raviol\\w*|de curry|à tartiner)",
    "feuilles? de brick",
    "boudoirs?",
    "brioches?",
    "tortillas?",
    "galettes? de bl[ée]",
    "fonds? (de veau|de volaille|blanc|brun|de poisson)",
    "fumet",
    "bouillon",
    "mayonnaise",
    "ketchup",
    "pesto",
    "g[ée]noise",
    "cr[èe]me p[âa]tissi[èe]re",
    "coulis",
    "confiture",
    "pralin[ée]",
    "yuzu kosho",
    "kimchi",
    "harissa",
  ].join("|"),
  "i",
);

export function looksStoreBought(name: string): boolean {
  return STORE_BOUGHT_PATTERN.test(name);
}

export interface PrepTimes {
  prepS: number;
  cookS: number;
  restS: number;
}

export interface LeadTime {
  /** Durée totale de la base (préparation + cuisson + repos), en secondes. */
  baseTotalS: number;
  /** Durée totale de la recette principale, en secondes. */
  recipeTotalS: number;
  /**
   * Délai conseillé entre le début de la base et le service, arrondi au quart
   * d'heure supérieur : la base est prête juste à temps pour la recette.
   */
  startBeforeServiceS: number;
}

const QUARTER_HOUR = 15 * 60;

function total(times: PrepTimes): number {
  return Math.max(0, times.prepS) + Math.max(0, times.cookS) + Math.max(0, times.restS);
}

export function leadTime(base: PrepTimes, recipe: PrepTimes): LeadTime {
  const baseTotalS = total(base);
  const recipeTotalS = total(recipe);
  const raw = baseTotalS + recipeTotalS;
  return {
    baseTotalS,
    recipeTotalS,
    startBeforeServiceS: Math.ceil(raw / QUARTER_HOUR) * QUARTER_HOUR,
  };
}
