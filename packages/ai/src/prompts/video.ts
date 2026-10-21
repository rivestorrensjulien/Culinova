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
