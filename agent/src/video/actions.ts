/**
 * Geste de la mascotte pour chaque plan du script TikTok, d'après le verbe à l'infinitif
 * qui ouvre le plan (« Émincer les oignons » → couper). Logique pure, testée.
 */
import type { Expression } from "./Mascot.tsx";

/** Planche de contrôle de tous les gestes (aperçu, jamais publié). */
export const GESTURES_ID = "GestesJulien";

export type Action =
  | "disposer"
  | "couper"
  | "melanger"
  | "poeler"
  | "chauffer"
  | "four"
  | "repos"
  | "verser"
  | "petrir"
  | "assaisonner"
  | "dresser";

const VERBS: Record<Action, string> = {
  disposer: "disposer preparer reunir rassembler sortir peser mesurer laver rincer montrer presenter aligner",
  couper:
    "couper emincer eplucher hacher trancher tailler ciseler detailler decouper peler zester raper effiler " +
    "evider equeuter epepiner concasser",
  melanger:
    "melanger fouetter battre mixer incorporer monter emulsionner delayer remuer touiller combiner blanchir " +
    "lisser ecraser piler",
  poeler:
    "saisir poeler revenir dorer griller sauter colorer rissoler cuire retourner snacker caramelir caramelise",
  chauffer:
    "chauffer fondre bouillir mijoter frire plonger pocher reduire porter infuser tiedir rechauffer confire",
  four: "enfourner gratiner rotir prechauffer",
  repos: "reposer refroidir mariner lever pousser attendre reserver refrigerer patienter egoutter macerer",
  verser: "verser napper arroser ajouter remplir mouiller deglacer couler presser",
  petrir: "petrir etaler faconner abaisser rouler former aplatir foncer plier",
  assaisonner:
    "assaisonner saler poivrer saupoudrer parsemer parfumer badigeonner enrober paner frotter pimenter",
  dresser:
    "dresser servir garnir assembler deposer decorer finir terminer empiler placer poser refermer deguster",
};

const BY_VERB = new Map<string, Action>();
for (const [action, verbs] of Object.entries(VERBS) as Array<[Action, string]>) {
  for (const verb of verbs.split(" ")) if (!BY_VERB.has(verb)) BY_VERB.set(verb, action);
}

/** Mots qui précèdent le vrai geste (« Faire fondre », « Laisser reposer », « Bien mélanger »). */
const LEAD = new Set(["faire", "laisser", "bien", "puis", "ensuite", "et", "on", "delicatement", "vite"]);

function words(text: string): string[] {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .split(/[^a-z]+/)
    .filter(Boolean);
}

/** « Cuire » change de geste selon l'ustensile : au four, dans l'eau ou l'huile, ou à la poêle. */
function refine(action: Action, all: string[]): Action {
  const has = (...w: string[]) => w.some((x) => all.includes(x));
  if (has("four", "enfourner"))
    return action === "repos" ? "repos" : action === "dresser" ? "dresser" : "four";
  if (
    action === "poeler" &&
    has("eau", "vapeur", "casserole", "bouillon", "huile", "friture", "bouillante")
  ) {
    return "chauffer";
  }
  return action;
}

export function shotAction(text: string): Action {
  const all = words(text);
  let start = 0;
  while (start < all.length - 1 && LEAD.has(all[start]!)) start++;
  const first = BY_VERB.get(all[start]!);
  if (first) return refine(first, all);
  for (const word of all.slice(start + 1)) {
    const action = BY_VERB.get(word);
    if (action) return refine(action, all);
  }
  return refine("melanger", all);
}

/** Expression du visage pendant le geste (le dressage, en dernier, rend la mascotte fière). */
export function actionExpression(action: Action, last: boolean): Expression {
  if (last || action === "dresser") return "fier";
  switch (action) {
    case "poeler":
    case "four":
      return "waouh";
    case "repos":
    case "assaisonner":
      return "clin";
    default:
      return "content";
  }
}

/**
 * Plan de présentation des ingrédients (« Disposer les oranges, les tomates… sur le plan de
 * travail ») : ce n'est pas une étape de la recette. La vidéo l'affiche en « Les ingrédients »
 * avec leur liste, et numérote les étapes à partir du plan suivant. Null pour un autre plan.
 */
export function ingredientsIntro(shot: string): string[] | null {
  if (shotAction(shot) !== "disposer") return null;
  const items = shot
    .replace(/^\s*\S+\s+/, "")
    .replace(/\s+(sur|dans|devant)\s+(le|la|les)\s+(plan de travail|table|planche|comptoir)\b.*$/i, "")
    .split(/\s*,\s*|\s+et\s+/)
    .map((item) =>
      item
        .trim()
        .replace(/^(les|la|le|l'|l’|des|du|de la|de l'|un|une)\s*/i, "")
        .replace(/[.;:]+$/, ""),
    )
    .filter(Boolean);
  if (items.length === 0) return null;
  return items.map((item, i) => (i === 0 ? item.charAt(0).toUpperCase() + item.slice(1) : item));
}

/** Libellé d'étape d'un plan : « Les ingrédients », ou « Étape n / total » sans compter la présentation. */
export function stepLabel(shots: string[], index: number): string {
  const intro = shots.length > 0 && ingredientsIntro(shots[0]!) !== null;
  if (intro && index === 0) return "Les ingrédients";
  const offset = intro ? 1 : 0;
  return `Étape ${index + 1 - offset} / ${shots.length - offset}`;
}

/** Texte affiché pour un plan (la liste des ingrédients pour le plan de présentation). */
export function shotText(shots: string[], index: number): string {
  const shot = shots[index] ?? "";
  const items = index === 0 ? ingredientsIntro(shot) : null;
  return items ? items.join(" · ") : shot;
}
