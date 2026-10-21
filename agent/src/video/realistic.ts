/**
 * Version « réaliste » de la vidéo : Chef Ju en 3D dans une vraie cuisine. Chaque plan du script
 * est découpé par Culinova en 1 à 3 scènes (une action visible chacune, état de départ et
 * d'arrivée) ; chaque scène = image de départ, image d'arrivée et clip de 5 s entre les deux.
 * Consignes envoyées aux modèles et déroulé ; logique pure, testée.
 */
import type { VideoProps } from "./timeline.ts";

export const REALISTIC_ID = "RecetteRealiste";
export const REFERENCE_ID = "MascotteReference";
export const IMAGE_MODEL = "fal-ai/nano-banana/edit";
export const VIDEO_MODEL = "fal-ai/kling-video/v2.6/pro/image-to-video";
/** Durée d'un clip généré (secondes). */
export const CLIP_SECONDS = 5;

export const REAL_HOOK_FRAMES = 135;
export const REAL_REVEAL_FRAMES = 105;
export const REAL_END_FRAMES = 120;
/** Plan non filmé (version économique) : image réaliste avec zoom lent, le temps de lire. */
export const STILL_FRAMES = 69;
/** Durée à l'écran d'une scène selon le nombre de scènes du plan (le clip est accéléré). */
const SCENE_FRAMES: Record<number, number> = { 1: 120, 2: 78, 3: 62 };

/** Découpage renvoyé par Culinova (GET /api/agent/scenes). */
export interface SceneScript {
  kitchen: string;
  hook: { start: string; motion: string };
  plans: Array<{
    plan: number;
    scenes: Array<{ action: string; start: string; end: string; motion: string }>;
  }>;
}

export interface RealisticProps extends VideoProps {
  /** Clip de l'accroche (fichier de agent/public). */
  hookClip: string | null;
  /**
   * Chaque plan, dans l'ordre : 1 à 3 clips filmés, ou (version économique) une seule image
   * réaliste animée par un zoom lent quand le plan n'est pas un plan clé.
   */
  plans: Array<{ clips: string[]; still?: string | null }>;
}

export const CHARACTER =
  "The chef is the character from image 1, kept exactly the same: same face, shaved head, short dark " +
  "beard with a grey patch on the chin, blue-grey eyes, white double-breasted chef jacket with only the " +
  "letters 'JU' embroidered in blue script on the chest and a tiny French flag on the collar, wristwatch. " +
  "Render him as a high-end 3D animated-film character (chibi proportions kept) with realistic materials: " +
  "cotton fabric texture, soft skin shading, real reflections.";

const REAL_WORLD =
  "Everything around him is real and photographic: real ingredients with natural textures, real utensils " +
  "(stainless steel, wood, ceramic, cast iron), shallow depth of field, like a frame from a cooking video " +
  "filmed on a smartphone.";

const FRAMING =
  "Vertical 9:16 medium shot at counter height: the chef's head in the upper half, his hands and the " +
  "counter clearly visible in the lower half. No text, no logo, no watermark.";

/** Accroche : image 1 = mascotte, image 2 = photo du plat. */
export function hookImagePrompt(script: SceneScript): string {
  return [
    `Kitchen: ${script.kitchen}.`,
    CHARACTER,
    `Scene: ${script.hook.start}`,
    "The finished dish looks exactly like image 2 (same container, same presentation, same garnish).",
    REAL_WORLD,
    FRAMING,
  ].join(" ");
}

/**
 * Début d'une scène : image 1 = mascotte, image 2 = scène précédente (même cuisine, même cadrage),
 * image 3 = photo du plat, pour le dressage seulement.
 */
export function sceneStartPrompt(script: SceneScript, start: string, plating: boolean): string {
  return [
    "Same kitchen, same lighting and same camera framing as image 2, a moment later.",
    CHARACTER,
    `Now: ${start}`,
    "Keep only what this description says is on the counter.",
    plating ? "The dish being plated must match image 3 (same container, same presentation)." : "",
    `Kitchen: ${script.kitchen}.`,
    REAL_WORLD,
    FRAMING,
  ]
    .filter(Boolean)
    .join(" ");
}

/** Fin d'une scène : image 1 = mascotte, image 2 = début de la même scène. */
export function sceneEndPrompt(end: string, plating: boolean): string {
  return [
    "Exactly the same scene, kitchen, framing and chef as image 2, a few seconds later.",
    CHARACTER,
    `Now: ${end}`,
    plating ? "The finished dish must match image 3 (same container, same presentation, same garnish)." : "",
    REAL_WORLD,
    "No text, no logo, no watermark.",
  ]
    .filter(Boolean)
    .join(" ");
}

/** Mouvement demandé au modèle vidéo, de l'image de départ à l'image d'arrivée. */
export function motionPrompt(motion: string): string {
  return (
    `The 3D chef ${motion.replace(/^the chef\s+/i, "")} Realistic food physics, natural hand movements, ` +
    "steady camera. The character keeps exactly the same appearance and outfit."
  );
}

export const NEGATIVE_PROMPT =
  "blur, distortion, low quality, text, subtitles, watermark, logo, extra fingers, deformed hands, " +
  "deformed face, character change, flicker, objects appearing from nowhere";

export function sceneFrames(sceneCount: number): number {
  return SCENE_FRAMES[Math.min(3, Math.max(1, sceneCount))]!;
}

/** Vitesse de lecture d'un clip de 5 s pour qu'il tienne en `frames` images (fin toujours montrée). */
export function playbackRate(frames: number, fps = 30): number {
  return (CLIP_SECONDS * fps) / frames;
}

export interface RealSegment {
  kind: "hook" | "shot" | "reveal" | "end";
  from: number;
  frames: number;
  index?: number;
}

export function realisticTimeline(props: Pick<RealisticProps, "plans" | "photoUrl">): RealSegment[] {
  const segments: RealSegment[] = [];
  let from = 0;
  const push = (segment: Omit<RealSegment, "from">) => {
    segments.push({ ...segment, from });
    from += segment.frames;
  };
  push({ kind: "hook", frames: REAL_HOOK_FRAMES });
  props.plans.forEach((plan, index) => {
    if (plan.clips.length === 0 && plan.still) return push({ kind: "shot", frames: STILL_FRAMES, index });
    const count = Math.max(1, plan.clips.length);
    push({ kind: "shot", frames: sceneFrames(count) * count, index });
  });
  if (props.photoUrl) push({ kind: "reveal", frames: REAL_REVEAL_FRAMES });
  push({ kind: "end", frames: REAL_END_FRAMES });
  return segments;
}

export function realisticFrames(props: Pick<RealisticProps, "plans" | "photoUrl">): number {
  return realisticTimeline(props).reduce((sum, s) => sum + s.frames, 0);
}

/** Taille du texte du plan dans le bandeau, selon sa longueur. */
export function bandFontSize(text: string): number {
  if (text.length > 150) return 54;
  if (text.length > 100) return 62;
  if (text.length > 60) return 70;
  return 80;
}

const SIGNATURE_ACTIONS = new Set(["poeler", "chauffer", "four", "verser", "petrir"]);

/**
 * Version économique : plans filmés = le premier (les ingrédients), le dernier (la présentation)
 * et un plan « signature » entre les deux (geste de cuisson le plus parlant, le plus tardif ;
 * ou le plan choisi, numéroté à partir de 1). Les autres plans deviennent des images animées.
 */
export function keyPlans(actions: string[], chosen?: number | null): number[] {
  const last = actions.length - 1;
  if (actions.length <= 3) return actions.map((_, i) => i);
  let signature = chosen && chosen > 1 && chosen < actions.length ? chosen - 1 : -1;
  if (signature < 0) {
    for (let i = last - 1; i > 0; i--) {
      if (SIGNATURE_ACTIONS.has(actions[i]!)) {
        signature = i;
        break;
      }
    }
  }
  if (signature < 0) signature = Math.floor(last / 2);
  return [0, signature, last];
}

/** Un seul clip pour un plan à plusieurs scènes : les mouvements s'enchaînent. */
export function joinMotions(motions: string[]): string {
  return motions.map((m) => m.trim().replace(/\.$/, "")).join(", then ") + ".";
}
