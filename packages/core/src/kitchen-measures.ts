/**
 * Mesures de cuisine (P3) : à côté des grammes, la mesure qui parle à la maison — nombre de
 * pièces (œufs, oignons, gousses), cuillères pour les petites quantités, centilitres pour les
 * liquides. L'IA la donne d'ordinaire (`displayQuantity` / `displayUnit`) ; ce module la
 * complète quand elle manque (anciennes recettes, listes de courses, garde-manger) et accorde
 * l'unité au nombre (« 1 œuf », « 3 pincées »).
 *
 * Valeurs moyennes, volontairement simples : la balance reste la référence.
 */
import { normalizeIngredientName } from "./ingredient-names";

export interface KitchenMeasure {
  value: number;
  unit: string;
}

type Lang = "fr" | "en";

/** Pièces : poids moyen d'une pièce et libellés singulier / pluriel. */
interface PieceRule {
  kind: "piece";
  match: RegExp;
  grams: number;
  fr: [string, string];
  en: [string, string];
}

/** Liquides : grammes par millilitre (≈ 1 pour l'eau, le lait, le vin…). */
interface LiquidRule {
  kind: "liquid";
  match: RegExp;
  density: number;
}

/** Petites quantités à la cuillère : poids d'une c. à soupe et d'une c. à café. */
interface SpoonRule {
  kind: "spoon";
  match: RegExp;
  tbsp: number;
  tsp: number;
  /** En dessous de ce poids : « 1 pincée » (sel, épices). */
  pinchBelow?: number;
  /** Au-delà, la cuillère ne parle plus : on pèse. */
  maxGrams: number;
}

type Rule = PieceRule | LiquidRule | SpoonRule;

const p = (match: RegExp, grams: number, fr: [string, string], en: [string, string]): PieceRule => ({
  kind: "piece",
  match,
  grams,
  fr,
  en,
});

/**
 * Règles lues dans l'ordre : les plus précises d'abord (« jus de citron » avant « citron »,
 * « pomme de terre » avant « pomme », « concentré de tomate » avant « tomate »).
 * Les noms sont comparés normalisés : minuscules, sans accents, au singulier, « œ » → « oe ».
 */
const RULES: Rule[] = [
  { kind: "spoon", match: /\b(?:sel|fleur de sel|salt)\b/, tbsp: 18, tsp: 6, pinchBelow: 1, maxGrams: 40 },
  {
    kind: "spoon",
    match: /\b(?:levure chimique|bicarbonate|baking powder|baking soda)\b/,
    tbsp: 12,
    tsp: 4,
    maxGrams: 25,
  },
  { kind: "spoon", match: /\b(?:levure de boulanger|levure seche|yeast)\b/, tbsp: 9, tsp: 3, maxGrams: 25 },
  { kind: "spoon", match: /\b(?:concentre de tomate|tomato paste)\b/, tbsp: 16, tsp: 5, maxGrams: 70 },
  { kind: "spoon", match: /\b(?:moutarde|mustard)\b/, tbsp: 15, tsp: 5, maxGrams: 60 },
  {
    kind: "spoon",
    match: /\b(?:miel|honey|sirop d'erable|maple syrup|melasse)\b/,
    tbsp: 21,
    tsp: 7,
    maxGrams: 70,
  },
  { kind: "spoon", match: /\b(?:cacao|cocoa)\b/, tbsp: 7, tsp: 2.5, maxGrams: 40 },
  { kind: "spoon", match: /\b(?:sucre|cassonade|vergeoise|sugar)\b/, tbsp: 12, tsp: 4, maxGrams: 50 },
  {
    kind: "spoon",
    match:
      /\b(?:farine|fecule|maizena|amidon|chapelure|semoule fine|poudre d'amande|amande en poudre|lait en poudre|flour|cornstarch|breadcrumb)\b/,
    tbsp: 8,
    tsp: 3,
    maxGrams: 40,
  },
  // Épices (après sucre, farine, cacao : « sucre en poudre » ; avant les pièces : « ail en poudre »).
  {
    kind: "spoon",
    match:
      /\b(?:en poudre|moulu|moulue|poivre|cumin|paprika|curry|cannelle|muscade|curcuma|piment d'espelette|gingembre moulu|ras el hanout|herbes de provence|origan|thym seche|thym|cardamome|coriandre moulue|garam masala|cinq epices|quatre epices|ground|pepper|cinnamon|nutmeg|turmeric|chili powder)\b/,
    tbsp: 6,
    tsp: 2,
    pinchBelow: 0.8,
    maxGrams: 30,
  },
  { kind: "spoon", match: /\b(?:beurre|butter|margarine)\b/, tbsp: 15, tsp: 5, maxGrams: 50 },
  {
    kind: "spoon",
    match: /\b(?:pate de curry|pate de piment|harissa|pesto|tahini|tahin|puree de sesame)\b/,
    tbsp: 16,
    tsp: 5,
    maxGrams: 60,
  },
  {
    kind: "spoon",
    match: /\b(?:graine|sesame|pavot|chia|capre|caper|seed)\b/,
    tbsp: 9,
    tsp: 3,
    maxGrams: 40,
  },

  // Liquides (avant les pièces : « jus de citron », « lait de coco »).
  {
    kind: "liquid",
    match:
      /\b(?:eau|lait|creme|bouillon|fumet|vin|biere|cidre|jus|cafe|the|sirop|rhum|cognac|calvados|armagnac|kirsch|porto|whisky|vodka|liqueur|sauce soja|sauce soya|vinaigre|nuoc mam|sauce poisson|sauce worcestershire|eau de fleur d'oranger|extrait de vanille|water|milk|cream|stock|broth|wine|beer|juice|coffee|tea|syrup|rum|soy sauce|vinegar|fish sauce|vanilla extract)\b/,
    density: 1,
  },
  { kind: "liquid", match: /\b(?:huile|oil)\b/, density: 0.92 },

  // Pièces.
  p(/^(?:jaune d'oeuf|jaune)$|\begg yolk\b/, 20, ["jaune", "jaunes"], ["yolk", "yolks"]),
  p(/^(?:blanc d'oeuf|blanc)$|\begg white\b/, 30, ["blanc", "blancs"], ["white", "whites"]),
  p(/\b(?:oeuf|egg)\b/, 50, ["œuf", "œufs"], ["egg", "eggs"]),
  p(/\b(?:gousse d'ail|ail|garlic clove|garlic)\b/, 5, ["gousse", "gousses"], ["clove", "cloves"]),
  p(/\b(?:echalote|shallot)\b/, 30, ["échalote", "échalotes"], ["shallot", "shallots"]),
  p(
    /\b(?:oignon nouveau|oignon cebette|cebette|spring onion|scallion)\b/,
    15,
    ["oignon nouveau", "oignons nouveaux"],
    ["spring onion", "spring onions"],
  ),
  p(/\b(?:oignon|onion)\b/, 150, ["oignon", "oignons"], ["onion", "onions"]),
  p(/\b(?:citron vert|lime)\b/, 70, ["citron vert", "citrons verts"], ["lime", "limes"]),
  p(/\b(?:citron|lemon)\b/, 120, ["citron", "citrons"], ["lemon", "lemons"]),
  p(/\b(?:orange)\b/, 200, ["orange", "oranges"], ["orange", "oranges"]),
  p(
    /\b(?:pomme de terre|patate|potato)\b/,
    150,
    ["pomme de terre", "pommes de terre"],
    ["potato", "potatoes"],
  ),
  p(
    /\b(?:patate douce|sweet potato)\b/,
    300,
    ["patate douce", "patates douces"],
    ["sweet potato", "sweet potatoes"],
  ),
  p(
    /\b(?:tomate cerise|cherry tomato)\b/,
    15,
    ["tomate cerise", "tomates cerises"],
    ["cherry tomato", "cherry tomatoes"],
  ),
  p(/\b(?:tomate|tomato)\b/, 120, ["tomate", "tomates"], ["tomato", "tomatoes"]),
  p(/\b(?:pomme|apple)\b/, 150, ["pomme", "pommes"], ["apple", "apples"]),
  p(/\b(?:poire|pear)\b/, 170, ["poire", "poires"], ["pear", "pears"]),
  p(/\b(?:banane|banana)\b/, 120, ["banane", "bananes"], ["banana", "bananas"]),
  p(/\b(?:avocat|avocado)\b/, 200, ["avocat", "avocats"], ["avocado", "avocados"]),
  p(/\b(?:carotte|carrot)\b/, 100, ["carotte", "carottes"], ["carrot", "carrots"]),
  p(/\b(?:courgette|zucchini)\b/, 250, ["courgette", "courgettes"], ["courgette", "courgettes"]),
  p(/\b(?:aubergine|eggplant)\b/, 300, ["aubergine", "aubergines"], ["aubergine", "aubergines"]),
  p(/\b(?:poivron|bell pepper)\b/, 160, ["poivron", "poivrons"], ["pepper", "peppers"]),
  p(/\b(?:concombre|cucumber)\b/, 300, ["concombre", "concombres"], ["cucumber", "cucumbers"]),
  p(/\b(?:poireau|leek)\b/, 200, ["poireau", "poireaux"], ["leek", "leeks"]),
  p(/\b(?:feuille de gelatine|gelatine|gelatin)\b/, 2, ["feuille", "feuilles"], ["sheet", "sheets"]),
  p(/\b(?:tranche de pain de mie|pain de mie)\b/, 25, ["tranche", "tranches"], ["slice", "slices"]),
  p(/\b(?:biscuit boudoir|boudoir|ladyfinger)\b/, 6, ["biscuit", "biscuits"], ["biscuit", "biscuits"]),
  p(/\b(?:piment|chili)\b/, 10, ["piment", "piments"], ["chili", "chilies"]),
];

function normalized(name: string): string {
  return normalizeIngredientName(name.replace(/œ/g, "oe").replace(/Œ/g, "Oe"));
}

/** Mots qui montrent que l'ingrédient n'est pas la pièce entière (« zeste de citron »). */
const NOT_WHOLE =
  /\b(?:zeste|zest|jus|juice|pulpe|coulis|puree|confiture|compote|sauce|chips|seche|sechee|confit|confite|dried)\b/;

function round(value: number, step: number): number {
  return Math.round(value / step) * step;
}

function ruleFor(name: string): Rule | null {
  const key = normalized(name);
  if (!key) return null;
  for (const rule of RULES) {
    if (!rule.match.test(key)) continue;
    if (rule.kind === "piece" && NOT_WHOLE.test(key)) return null;
    return rule;
  }
  return null;
}

/**
 * Mesure de cuisine déduite du nom et du poids, quand l'IA n'en a pas donné.
 * `uses` : `recipe` (toutes les mesures) ou `shopping` (pièces et liquides seulement : on
 * n'achète pas « 2 c. à soupe » de farine).
 */
export function estimateKitchenMeasure(
  name: string,
  grams: number,
  options: { lang?: Lang; uses?: "recipe" | "shopping" } = {},
): KitchenMeasure | null {
  if (!(grams > 0)) return null;
  const rule = ruleFor(name);
  if (!rule) return null;
  const lang = options.lang ?? "fr";
  const shopping = options.uses === "shopping";

  if (rule.kind === "piece") {
    const count = round(grams / rule.grams, 0.5);
    if (count < 0.5 || count > 30) return null;
    return { value: count, unit: rule[lang][count < 2 ? 0 : 1] };
  }

  if (rule.kind === "liquid") {
    const ml = grams / rule.density;
    if (!shopping && ml < 45) {
      if (ml >= 12)
        return { value: Math.max(1, round(ml / 15, 0.5)), unit: lang === "en" ? "tbsp" : "c. à soupe" };
      return { value: Math.max(0.5, round(ml / 5, 0.5)), unit: lang === "en" ? "tsp" : "c. à café" };
    }
    if (shopping && ml < 50) return null;
    if (ml >= 1000) return { value: round(ml / 1000, 0.05), unit: "l" };
    return { value: round(ml / 10, ml < 100 ? 0.5 : 1), unit: "cl" };
  }

  if (shopping || grams > rule.maxGrams) return null;
  if (rule.pinchBelow !== undefined && grams < rule.pinchBelow) {
    return { value: 1, unit: lang === "en" ? "pinch" : "pincée" };
  }
  if (grams >= rule.tbsp * 0.9) {
    return { value: round(grams / rule.tbsp, 0.5), unit: lang === "en" ? "tbsp" : "c. à soupe" };
  }
  return { value: Math.max(0.5, round(grams / rule.tsp, 0.5)), unit: lang === "en" ? "tsp" : "c. à café" };
}

/** Unités qui ne s'accordent pas (abréviations, cuillères). */
const INVARIABLE = /^(?:c\.|cuil\S*|cs|cc|tbsp|tsp|cl|ml|l|g|kg|dl|oz|lb|cups?)(?:\s|$)/i;

const FR_PLURALS: Record<string, string> = {
  poireau: "poireaux",
  morceau: "morceaux",
  oignon: "oignons",
};

/**
 * Accorde l'unité au nombre : « 1 œuf », « 0,5 œuf », « 3 pincées », « 2 gousses ».
 * En français, singulier en dessous de 2 ; en anglais, seulement pour 1 et moins.
 * Pour une unité composée (« tranches de pain »), seul le premier mot s'accorde.
 */
export function agreeKitchenUnit(value: number, unit: string): string {
  const text = unit.trim();
  if (!text || INVARIABLE.test(text)) return text;
  const english =
    /^(?:egg|yolk|white|clove|pinch|slice|sheet|leaf|lea|piece|can|stick|sprig|dash|handful|cup)/i.test(text);
  const plural = english ? value > 1 : value >= 2;
  const [first, ...rest] = text.split(" ");
  if (!first) return text;
  const tail = rest.length ? ` ${rest.join(" ")}` : "";
  // « citron vert » / « citrons verts » : l'adjectif suit le nom (un seul mot après).
  const adjective = !english && rest.length === 1 && !/^(?:de|d'|du|des)/.test(rest[0]!) ? rest[0]! : null;
  if (plural) {
    if (/[sxz]$/i.test(first)) return text;
    const word = english
      ? /(?:ch|sh)$/i.test(first)
        ? `${first}es`
        : /f$/i.test(first)
          ? `${first.slice(0, -1)}ves`
          : `${first}s`
      : (FR_PLURALS[first.toLowerCase()] ?? `${first}${/eau$/i.test(first) ? "x" : "s"}`);
    if (adjective && !/[sx]$/i.test(adjective))
      return `${word} ${adjective}${/eau$/i.test(adjective) ? "x" : "s"}`;
    return `${word}${tail}`;
  }
  let word = first;
  if (english) {
    if (/ches$|shes$/i.test(word)) word = word.slice(0, -2);
    else if (/ves$/i.test(word)) word = `${word.slice(0, -3)}f`;
    else if (/s$/i.test(word) && !/ss$/i.test(word)) word = word.slice(0, -1);
  } else if (/eaux$/i.test(word)) word = word.slice(0, -1);
  else if (/s$/i.test(word) && word.length > 3 && !/ss$/i.test(word)) word = word.slice(0, -1);
  const singleAdjective = !adjective
    ? adjective
    : /aux$/i.test(adjective)
      ? `${adjective.slice(0, -3)}au`
      : /s$/i.test(adjective) && !/ss$/i.test(adjective)
        ? adjective.slice(0, -1)
        : adjective;
  return singleAdjective !== null ? `${word} ${singleAdjective}` : `${word}${tail}`;
}
