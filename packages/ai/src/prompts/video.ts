/**
 * Découpage en scènes de la vidéo réaliste d'une recette (Chef Ju en 3D dans une vraie cuisine).
 * Chaque plan du script TikTok devient 1 à 3 scènes de 5 secondes, une action visible par scène,
 * avec l'état exact du plan de travail au début et à la fin (continuité d'une scène à l'autre).
 * Les descriptions sont en anglais : elles sont envoyées aux modèles d'images et de vidéo.
 */
import { z } from "zod";

export const VIDEO_SCENES_PROMPT_VERSION = "video.scenes@1";

export const VIDEO_SCENES_SYSTEM_PROMPT = `Tu es réalisateur de vidéos culinaires courtes (TikTok, Reels). Le personnage est « the chef » (Chef Ju, mascotte en 3D) ; ne décris jamais son apparence, elle est fournie ailleurs. Le décor, les ingrédients et les ustensiles sont réels et photographiques.

À partir de la recette (ingrédients, étapes, dressage) et du script (accroche, plans numérotés), découpe la vidéo en scènes. Chaque scène sera une image de départ, une image d'arrivée et un clip de 5 secondes entre les deux.

Règles :
- kitchen : une seule description de la cuisine (style, plan de travail, lumière), reprise dans toutes les scènes.
- Un plan = 1 à 3 scènes, dans l'ordre du plan. Une scène = UNE action simple et bien visible. Si le plan enchaîne plusieurs actions (« presser les oranges, puis couper les tomates en dés et mélanger »), fais une scène par action (3 au plus : regroupe les moins visuelles).
- Plan « disposer / préparer / réunir les ingrédients » : une seule scène. Tous les ingrédients crus du plan sont déjà joliment présentés sur le plan de travail au départ ; le chef les montre un à un (il désigne ou soulève chaque élément). Aucune préparation.
- start et end (en anglais) décrivent précisément ce qu'on voit : ce que le chef tient, ce qu'il fait, l'état des aliments et des récipients sur le plan de travail.
- Continuité : ce qui a été préparé dans les scènes précédentes reste visible tel quel (bol de salsa, avocat écrasé, jus pressé…) ; les ingrédients pas encore utilisés restent crus ; aucun élément n'apparaît avant l'étape qui le fabrique (pas d'œuf sur la tartine avant l'étape de l'œuf, pas de plat fini avant le dressage).
- end est le résultat exact de l'action (pain grillé sorti du grille-pain, tartine garnie de tout sauf l'œuf…).
- Physique réelle des aliments : eau frémissante = petites bulles régulières ; œuf poché = blanc pris enveloppant le jaune, forme irrégulière, jamais un jaune seul ; « griller le pain » sans autre précision = grille-pain. Respecte les interdits du plan (« sans remuer » = le chef ne touche plus à rien et attend en regardant).
- motion (en anglais, une phrase, au présent, commençant par un verbe à la 3e personne) : ce qui se passe pendant les 5 secondes pour aller de start à end (« slides the eggs one by one into the simmering water, then waits, watching, hands still »).
- Dernier plan (dressage) : end = le plat exactement comme dans le dressage (même contenant, même disposition, mêmes garnitures).
- hook : le chef présente fièrement le plat fini (comme au dressage) sur le plan de travail.
- 14 scènes au plus en tout (hors accroche). Jamais de texte, de logo ni de visage humain réel.`;

const scene = z.object({
  /** Action en français, courte (« Presser les oranges »). */
  action: z.string().min(1),
  start: z.string().min(1),
  end: z.string().min(1),
  motion: z.string().min(1),
});

export const videoScenesSchema = z.object({
  kitchen: z.string().min(1),
  hook: z.object({ start: z.string().min(1), motion: z.string().min(1) }),
  plans: z
    .array(z.object({ plan: z.int().min(1), scenes: z.array(scene).min(1).max(3) }))
    .min(1)
    .max(8),
});

export type VideoScenes = z.infer<typeof videoScenesSchema>;

export interface VideoScenesInput {
  name: string;
  ingredients: Array<{ label: string; amount: string }>;
  steps: string[];
  plating: string | null;
  hook: string;
  shots: string[];
}

export function buildVideoScenesPrompt(input: VideoScenesInput): { system: string; user: string } {
  const user = [
    `Recette : ${input.name}`,
    "",
    "Ingrédients :",
    ...input.ingredients.map((i) => `- ${i.label} : ${i.amount}`),
    "",
    "Étapes :",
    ...input.steps.map((step, index) => `${index + 1}. ${step}`),
    "",
    `Dressage : ${input.plating ?? "non précisé"}`,
    "",
    "Script :",
    `Accroche : ${input.hook}`,
    ...input.shots.map((shot, index) => `Plan ${index + 1} : ${shot}`),
    "",
    `Rends exactement ${input.shots.length} plans (plan = 1 à ${input.shots.length}).`,
  ].join("\n");
  return { system: VIDEO_SCENES_SYSTEM_PROMPT, user };
}

/** Problèmes de forme : un plan par ligne du script, dans l'ordre, 14 scènes au plus. */
export function videoScenesProblems(scenes: VideoScenes, shotCount: number): string[] {
  const problems: string[] = [];
  if (scenes.plans.length !== shotCount) {
    problems.push(`plans : attendu ${shotCount}, reçu ${scenes.plans.length}.`);
  }
  scenes.plans.forEach((plan, index) => {
    if (plan.plan !== index + 1) problems.push(`plans[${index}].plan doit valoir ${index + 1}.`);
  });
  const total = scenes.plans.reduce((sum, plan) => sum + plan.scenes.length, 0);
  if (total > 14) problems.push(`${total} scènes : 14 au plus.`);
  return problems;
}

/**
 * Format court d'un plat (signature commune : la photo se dévoile au début, Chef Ju dit
 * « Et voilà ! » à la fin), choisi d'après le dressage (décision de Julien du 24/10) :
 * - eclate : les couches s'écartent au-dessus du contenant, puis se reposent une à une (vue du dessus) ;
 * - coupe : le couteau tranche le plat, une part se soulève et montre ses couches intérieures ;
 * - dessus : vue du dessus, la base arrive dans le contenant puis chaque garniture tombe une à une ;
 * - geste : gros plan filmé sur un seul liquide qui nappe ou coule (sauce, sirop, glaçage…), garnitures déjà en place.
 * Toutes les descriptions sont rendues, pour qu'un autre format puisse être demandé sans nouvelle analyse.
 */
export const VIDEO_LAYERS_PROMPT_VERSION = "video.layers@4";

export const VIDEO_FORMATS = ["eclate", "coupe", "dessus", "geste"] as const;
export type VideoFormat = (typeof VIDEO_FORMATS)[number];

export const VIDEO_LAYERS_SYSTEM_PROMPT = `Tu prépares une vidéo culinaire courte (TikTok, Reels) d'un plat, à partir de sa recette (ingrédients, étapes, dressage). La vidéo commence par la photo du plat fini et se termine par le chef qui dit « Et voilà ! ». Entre les deux, un des quatre formats :
- eclate : les éléments du plat s'écartent verticalement au-dessus du contenant, puis, vus du dessus, se reposent un à un dans le contenant jusqu'au plat fini.
- coupe : un couteau tranche le plat, une spatule soulève une part au ralenti et montre ses couches intérieures (vapeur, fromage qui file).
- dessus : vue du dessus, le contenant vide reçoit la base, puis chaque garniture et chaque finition tombe une à une.
- geste : un gros plan filmé sur un seul geste simple qui rend le plat appétissant : un liquide qui nappe ou coule (sauce, caramel, sirop, glaçage, crème, huile).

format : choisis celui qui montre le mieux CE plat :
- eclate pour ce qui est empilé ou posé en éléments bien distincts : tartines, tostadas, burgers, sandwichs, bao, tacos, wraps ouverts, assiettes à plusieurs éléments, desserts montés en hauteur.
- coupe pour ce qui est cuit ou moulé en strates, ou dont l'intérieur fait le spectacle : moussaka, lasagnes, gratins, tartes, quiches, tourtes, gâteaux, terrines, roulés, fondants, pains farcis.
- dessus pour ce qui est mélangé, en sauce ou servi dans un bol : soupes, currys, mijotés, ragoûts, risottos, pâtes, purées, bols composés, salades, poke.
- geste pour ce que définit un nappage, une coulure, un glaçage ou un service versé : crêpes et pancakes nappés, desserts arrosés de sauce, boissons, affogato, plats flambés.

Décris dans tous les cas (en anglais sauf les noms) :
- container : le contenant de service exact du dressage (planche, assiette, bol, barquette…), sa matière et sa couleur, et la surface sur laquelle il est posé.
- layers : les éléments visibles du plat fini, de celui posé en premier dans le contenant à celui posé en dernier (3 à 7). Pour chacun : name (français, court, avec majuscule : « Pain de campagne grillé »), look (anglais : aspect exact, forme, quantité, disposition dans le contenant, comme sur le plat fini). Regroupe ce qui se pose en même temps (« sel, poivre et piment » = une seule couche). Les accompagnements servis à côté forment la dernière couche, posés à côté du plat.
- cut : la coupe. vessel (anglais : le plat de cuisson ou de service entier, intact, avant la première part : matière, forme, dessus doré…), start (anglais : image de départ, le plat entier intact, un couteau et une spatule à côté, vue de trois quarts), end (anglais : une part nette soulevée sur la spatule juste au-dessus du plat entamé, sa tranche bien visible avec chaque couche de bas en haut, vapeur), motion (anglais, une phrase au présent commençant par un verbe : le couteau tranche, la spatule soulève la part au ralenti), strata (noms français des couches visibles dans la tranche, de bas en haut, 2 à 6). Pour un plat sans couches, la tranche montre son intérieur (mie, farce, cœur coulant).
- gesture : le geste. Un seul liquide versé ou passé au pinceau, en un filet continu (sauce, caramel, sirop, miel, glaçage, crème, huile) : jamais rien qui tombe en morceaux (fleurs, pétales, zestes, graines, amandes, sucre, herbes), car l'IA vidéo fait disparaître ces éléments en vol. action (français, court : « Napper de caramel »), start (anglais : gros plan juste avant le geste, plat fini avec toutes ses garnitures solides déjà en place — fleurs, zestes, amandes… — il ne manque que le liquide, la main ou l'ustensile prêt), end (anglais : juste après, le liquide brillant en place, garnitures identiques au départ, comme sur le plat fini), motion (anglais, une phrase au présent : le liquide coule ou nappe lentement pendant 5 secondes, rien d'autre ne tombe ni ne bouge sur le plat).
- layered : true si le plat se prête à une vue éclatée, sinon false.
Jamais de visage humain : seulement des mains, des ustensiles et la nourriture.`;

export const videoLayersSchema = z.object({
  format: z.enum(VIDEO_FORMATS),
  container: z.string().min(1),
  layered: z.boolean(),
  layers: z
    .array(z.object({ name: z.string().min(1), look: z.string().min(1) }))
    .min(2)
    .max(8),
  cut: z.object({
    vessel: z.string().min(1),
    start: z.string().min(1),
    end: z.string().min(1),
    motion: z.string().min(1),
    strata: z.array(z.string().min(1)).min(1).max(6),
  }),
  gesture: z.object({
    action: z.string().min(1),
    start: z.string().min(1),
    end: z.string().min(1),
    motion: z.string().min(1),
  }),
});

export type VideoLayers = z.infer<typeof videoLayersSchema>;

export function buildVideoLayersPrompt(input: Omit<VideoScenesInput, "hook" | "shots">): {
  system: string;
  user: string;
} {
  const user = [
    `Recette : ${input.name}`,
    "",
    "Ingrédients :",
    ...input.ingredients.map((i) => `- ${i.label} : ${i.amount}`),
    "",
    "Étapes :",
    ...input.steps.map((step, index) => `${index + 1}. ${step}`),
    "",
    `Dressage : ${input.plating ?? "non précisé"}`,
  ].join("\n");
  return { system: VIDEO_LAYERS_SYSTEM_PROMPT, user };
}
