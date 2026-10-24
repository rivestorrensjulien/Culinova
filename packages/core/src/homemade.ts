/**
 * Préparations « faites maison » : repérage des produits souvent achetés tout
 * prêts, et calcul de l'heure de départ conseillée d'une base préparée en amont.
 */

/**
 * Préparations réalisables à la maison, souvent achetées toutes prêtes (demande de Julien :
 * tout ce qui peut se faire maison propose « Faire maison » ou « acheté tout prêt »).
 * Complète le repérage de l'IA, pour toutes les recettes.
 */
const STORE_BOUGHT_PATTERN = new RegExp(
  [
    // Pains, galettes et viennoiseries.
    "\\bpains?\\b",
    "baguettes?",
    "focaccia",
    "ciabatta",
    "bagels?",
    "brioches?",
    "tortillas?",
    "wraps?\\b",
    "galettes? de (bl[ée]|ma[iï]s|sarrasin)",
    "cr[êe]pes?\\b",
    "blinis?",
    "crackers?",
    // Farines transformées et pâtes.
    "masa harina",
    "farine de ma[iï]s nixtamalis",
    "p[âa]tes? (feuillet[ée]e|bris[ée]e|sabl[ée]e|à pizza|à pain|à choux|à crêpes|filo|phyllo|à raviol\\w*|de curry|à tartiner|d'amande|de pistache|de piment|de sésame|fra[iî]ches?)",
    "feuilles? de brick",
    "gnocchis?",
    "raviolis?",
    "nouilles fra[iî]ches",
    // Biscuits et pâtisserie.
    "boudoirs?",
    "sabl[ée]s\\b",
    "g[ée]noise",
    "cr[èe]me p[âa]tissi[èe]re",
    "cr[èe]me anglaise",
    "lemon curd",
    "ganache",
    "caramel",
    "meringues?",
    "pralin[ée]",
    "confiture",
    "coulis",
    // Fonds, sauces et condiments.
    "fonds? (de veau|de volaille|blanc|brun|de poisson|de légumes)",
    "fumet",
    "bouillon",
    "mayonnaise",
    "a[iï]oli",
    "ketchup",
    "pesto",
    "sauce (tomate|teriyaki|barbecue|bbq|hoisin|b[ée]chamel|hollandaise|ponzu|c[ée]sar|tartare|aigre-douce|sriracha|chimichurri|piquante)",
    "chimichurri",
    "harissa",
    "sambal",
    "huile piment[ée]e",
    "chili crisp",
    "yuzu kosho",
    "kimchi",
    "pickles?",
    "pickl[ée]",
    "chutney",
    "relish",
    "tahin[ié]?",
    "houmous|hummus",
    "tapenade",
    "guacamole",
    "tzatziki",
    "beurre de cacahu[èe]tes?",
    "pur[ée]e d'(amande|noisette|arachide)",
    // Mélanges d'épices.
    "garam masala",
    "ras el hanout",
    "za'?atar",
    "dukkah",
    "curry en poudre",
    "cinq[- ]épices",
    "quatre[- ]épices",
    "m[ée]lange d'épices",
    "furikake",
    // Produits laitiers et assimilés simples à faire.
    "ricotta",
    "paneer",
    "labneh",
    "mascarpone",
    "yaourts?",
    "ghee",
    "beurre clarifi[ée]",
    "laits? (d'amande|d'avoine|de coco|v[ée]g[ée]tal|de soja)",
    // Divers.
    "chapelure",
    "panko",
    "cro[uû]tons?",
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
