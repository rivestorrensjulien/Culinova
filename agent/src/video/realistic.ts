/**
 * Version « réaliste » de la vidéo (comparatif) : Chef Ju en 3D dans une vraie cuisine,
 * un clip vidéo IA par plan. Consignes envoyées aux modèles et déroulé ; logique pure, testée.
 */
import type { Action } from "./actions.ts";
import type { VideoProps } from "./timeline.ts";

export const REALISTIC_ID = "RecetteRealiste";
export const REFERENCE_ID = "MascotteReference";
export const IMAGE_MODEL = "fal-ai/nano-banana/edit";
export const VIDEO_MODEL = "fal-ai/kling-video/v2.6/pro/image-to-video";

export const REAL_HOOK_FRAMES = 135;
export const REAL_SHOT_FRAMES = 120;
export const REAL_REVEAL_FRAMES = 105;
export const REAL_END_FRAMES = 90;

export interface RealisticProps extends VideoProps {
  /** Clips (fichiers de agent/public) : 0 = accroche, puis un par plan. */
  clips: string[];
}

const GESTURES: Record<Action, string> = {
  disposer: "placing fresh raw ingredients one by one on the counter",
  couper: "chopping ingredients on a wooden cutting board with a chef's knife",
  melanger: "whisking a mixture in a large mixing bowl",
  poeler: "tossing food in a hot frying pan on the stove, the food sizzling",
  chauffer: "stirring a saucepan on the stove with a wooden spoon, steam rising",
  four: "sliding a baking tray into a hot, glowing oven",
  repos: "waiting with crossed arms next to a covered bowl and a kitchen timer, with a wink",
  verser: "pouring a liquid from a jug or a pan over the food",
  petrir: "kneading and rolling out dough with a rolling pin on a floured counter",
  assaisonner: "sprinkling seasoning and herbs with his fingertips over the food",
  dresser: "carefully plating the finished dish",
};

export function gesture(action: Action): string {
  return GESTURES[action];
}

const CHARACTER =
  "The chef is the character from image 1, kept exactly the same: same face, shaved head, short dark " +
  "beard with a grey patch on the chin, blue-grey eyes, white double-breasted chef jacket with a small " +
  "French flag on the collar and 'Julien' embroidered in blue script, wristwatch. Render him as a " +
  "high-end 3D animated-film character (chibi proportions kept) with realistic materials: cotton fabric " +
  "texture, soft skin shading, real reflections.";

const REAL_WORLD =
  "Everything around him is real and photographic: a warm, lived-in kitchen, a real wooden counter, real " +
  "ingredients with natural textures, real utensils (stainless steel, wood, ceramic, cast iron), soft " +
  "daylight from a window, shallow depth of field, like a frame from a cooking video filmed on a smartphone.";

const FRAMING =
  "Vertical 9:16 medium shot: the chef and his hands clearly visible, the counter in the lower third, the " +
  "upper third calm and uncluttered for overlaid text. No text, no logo, no watermark.";

/** Image de départ d'un plan (modèle d'édition : 1 = mascotte, 2 = photo du plat). */
export function shotImagePrompt(name: string, plan: string, action: Action): string {
  const dish =
    action === "dresser"
      ? "He is plating the dish exactly as shown in image 2 (same container, same presentation, same garnish)."
      : "Ingredients and colours must match the finished dish in image 2, but the finished dish is not shown yet.";
  return [
    `Photorealistic cooking scene for the recipe "${name}", step: « ${plan} ».`,
    CHARACTER,
    `He is ${gesture(action)}.`,
    dish,
    REAL_WORLD,
    FRAMING,
  ].join(" ");
}

export function hookImagePrompt(name: string): string {
  return [
    `Photorealistic cooking scene for the recipe "${name}".`,
    CHARACTER,
    "He proudly presents the finished dish from image 2 on the counter (same container, same presentation, " +
      "same garnish), smiling, one hand pointing at it.",
    REAL_WORLD,
    FRAMING,
  ].join(" ");
}

/** Mouvement demandé au modèle vidéo à partir de l'image de départ. */
export function motionPrompt(what: string): string {
  return (
    `The 3D chef ${what}. Natural, smooth hand movements, realistic food physics, gentle steam when hot, ` +
    "subtle handheld camera slowly pushing in. The character keeps exactly the same appearance and outfit."
  );
}

export const NEGATIVE_PROMPT =
  "blur, distortion, low quality, text, subtitles, watermark, logo, extra fingers, deformed hands, " +
  "deformed face, character change, flicker";

export interface RealSegment {
  kind: "hook" | "shot" | "reveal" | "end";
  from: number;
  frames: number;
  index?: number;
}

export function realisticTimeline(props: Pick<VideoProps, "shots" | "photoUrl">): RealSegment[] {
  const segments: RealSegment[] = [];
  let from = 0;
  const push = (segment: Omit<RealSegment, "from">) => {
    segments.push({ ...segment, from });
    from += segment.frames;
  };
  push({ kind: "hook", frames: REAL_HOOK_FRAMES });
  props.shots.forEach((_, index) => push({ kind: "shot", frames: REAL_SHOT_FRAMES, index }));
  if (props.photoUrl) push({ kind: "reveal", frames: REAL_REVEAL_FRAMES });
  push({ kind: "end", frames: REAL_END_FRAMES });
  return segments;
}

export function realisticFrames(props: Pick<VideoProps, "shots" | "photoUrl">): number {
  return realisticTimeline(props).reduce((sum, s) => sum + s.frames, 0);
}
