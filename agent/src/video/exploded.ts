/**
 * Format court « vue éclatée » : la photo du plat se dévoile, ses couches s'écartent au-dessus du
 * contenant, puis, vues du dessus, se reposent une à une jusqu'au plat fini ; retour à la photo
 * et Chef Ju conclut « Et voilà ! » avec un baiser du chef. Consignes et déroulé ; logique pure.
 */
import { CHARACTER } from "./realistic.ts";
import type { VideoProps } from "./timeline.ts";

export const EXPLODED_ID = "RecetteEclatee";
/** Piste audio de 5 s : la voix de Julien placée au moment où elle passe dans la scène « Et voilà ». */
export const VOICE_TRACK_ID = "VoixCalee";
/** Synchronisation des lèvres de Chef Ju sur la voix de Julien (≈ 0,07 € par clip de 5 s). */
export const LIPSYNC_MODEL = "fal-ai/kling-video/lipsync/audio-to-video";

/** Formats courts (même début, même fin « Et voilà ! »), choisis par Culinova d'après le plat. */
export const SHORT_FORMATS = ["eclate", "coupe", "dessus", "geste"] as const;
export type ShortFormat = (typeof SHORT_FORMATS)[number];

export function isShortFormat(value: unknown): value is ShortFormat {
  return typeof value === "string" && (SHORT_FORMATS as readonly string[]).includes(value);
}

/** Analyse du plat renvoyée par Culinova (GET /api/agent/couches). */
export interface LayerScript {
  /** Format conseillé (absent avec une ancienne analyse : vue éclatée). */
  format?: ShortFormat;
  container: string;
  layered: boolean;
  layers: Array<{ name: string; look: string }>;
  /** Coupe : plat entier, puis part soulevée qui montre ses couches (strata, de bas en haut). */
  cut?: { vessel: string; start: string; end: string; motion: string; strata: string[] };
  /** Geste : gros plan avant et après le geste (nappage, coulure…), et ce qui se passe entre les deux. */
  gesture?: { action: string; start: string; end: string; motion: string };
}

export interface ExplodedProps extends VideoProps {
  /** Format court (vue éclatée par défaut). */
  format?: ShortFormat;
  /** Clip principal : les couches s'écartent (éclatée), la part se soulève (coupe) ou le geste. */
  explodeClip: string | null;
  /** Le clip principal garde son son (coupe et geste : grésillement, coulure). */
  clipSound?: boolean;
  /** Vues du dessus : 0 = contenant vide, puis une image par couche posée. */
  topViews: string[];
  layerNames: string[];
  /** Clip : Chef Ju fait le baiser du chef et dit « Et voilà ! » (avec le son). */
  voilaClip: string | null;
}

export const PHOTO_FRAMES = 66;
export const EXPLODE_FRAMES = 120;
/** Coupe et geste : le clip de 5 s joué à vitesse normale (son compris). */
export const CLIP_FRAMES = 150;
export const EMPTY_FRAMES = 24;
export const LAYER_FRAMES = 27;
export const FINAL_FRAMES = 48;
export const VOILA_FRAMES = 165;
/** Image de la scène « Et voilà » où commence la voix de Julien (après le baiser du chef). */
export const VOICE_START = 40;
export const EXPLODED_END_FRAMES = 90;

export type ExplodedKind = "photo" | "explode" | "assemble" | "final" | "voila" | "end";
export interface ExplodedSegment {
  kind: ExplodedKind;
  from: number;
  frames: number;
}

/**
 * Déroulé selon le format : la photo, puis
 * - eclate : les couches s'écartent, puis se reposent une à une (vue du dessus) ;
 * - coupe et geste : le clip (part soulevée ou geste, avec le son) ;
 * - dessus : vue du dessus, la base puis chaque garniture ;
 * puis la photo finale, « Et voilà ! » et la carte de fin.
 */
export function explodedTimeline(props: Pick<ExplodedProps, "layerNames" | "format">): ExplodedSegment[] {
  const format = props.format ?? "eclate";
  const assemble: [ExplodedKind, number] = [
    "assemble",
    EMPTY_FRAMES + props.layerNames.length * LAYER_FRAMES,
  ];
  const middle: Array<[ExplodedKind, number]> =
    format === "eclate"
      ? [["explode", EXPLODE_FRAMES], assemble]
      : format === "dessus"
        ? [assemble]
        : [["explode", CLIP_FRAMES]];
  const frames: Array<[ExplodedKind, number]> = [
    ["photo", PHOTO_FRAMES],
    ...middle,
    ["final", FINAL_FRAMES],
    ["voila", VOILA_FRAMES],
    ["end", EXPLODED_END_FRAMES],
  ];
  let from = 0;
  return frames.map(([kind, length]) => {
    const segment = { kind, from, frames: length };
    from += length;
    return segment;
  });
}

export function explodedFrames(props: Pick<ExplodedProps, "layerNames" | "format">): number {
  return explodedTimeline(props).reduce((sum, s) => sum + s.frames, 0);
}

/** Couche visible à l'image `frame` de la scène « vue du dessus » (-1 = contenant vide). */
export function layerAt(frame: number, count: number): number {
  if (frame < EMPTY_FRAMES) return -1;
  return Math.min(count - 1, Math.floor((frame - EMPTY_FRAMES) / LAYER_FRAMES));
}

const NO_TEXT = "Photorealistic food photography, natural light. No text, no logo, no watermark.";

/** Image 1 = photo du plat. */
export function explodedImagePrompt(script: LayerScript): string {
  const order = script.layers.map((layer, i) => `${i + 1}. ${layer.look}`).join(" ");
  return [
    "Exploded view of the exact same dish as image 1: same container, same food, same camera angle,",
    "same background and lighting. The elements of the dish float apart vertically in mid-air above the",
    `container, with clear gaps between them, from bottom to top: ${order}`,
    `Container: ${script.container}.`,
    "Nothing missing, nothing added, every element keeps its exact look.",
    NO_TEXT,
  ].join(" ");
}

export const EXPLODE_MOTION =
  "The elements of the dish gently lift and separate vertically, floating apart in mid-air above the " +
  "container in smooth slow motion. Static camera, realistic food textures.";

/** Image 1 = photo du plat. */
export function topEmptyPrompt(script: LayerScript): string {
  return [
    "Top-down shot, camera straight above at 90 degrees, of the same serving container as in image 1,",
    `empty and clean, centred in the frame: ${script.container}.`,
    "Same surface and same warm light around it.",
    NO_TEXT,
  ].join(" ");
}

/** Image 1 = vue du dessus précédente, image 2 = photo du plat. */
export function topAddPrompt(layer: { look: string }): string {
  return [
    "Exactly the same top-down shot as image 1: same container, same framing, same light, same surface.",
    "Everything already there stays identical. Add only this element, placed exactly as on the finished",
    `dish in image 2: ${layer.look}.`,
    NO_TEXT,
  ].join(" ");
}

/** Image 1 = mascotte, image 2 = photo du plat. */
export function voilaImagePrompt(): string {
  return [
    CHARACTER,
    "He stands behind a wooden counter in a warm, real home kitchen, next to the finished dish from",
    "image 2 (same container, same presentation). The fingertips of his right hand are pinched together",
    "against his lips, eyes closed, savouring, about to do a chef's kiss.",
    "Vertical 9:16 medium shot, his head in the upper half, the dish in the lower part of the frame.",
    "Shallow depth of field. No text, no logo, no watermark.",
  ].join(" ");
}

export const VOILA_MOTION =
  "The 3D chef kisses his pinched fingertips and throws his hand open outward in a classic, delighted " +
  "chef's kiss, eyes closed, then smiles at the camera and speaks a short cheerful sentence, " +
  "his mouth clearly visible. " +
  "The character keeps exactly the same appearance, blue-grey eyes and outfit.";

/** Coupe, image de départ (image 1 = photo du plat) : le plat entier, intact. */
export function cutStartPrompt(script: LayerScript): string {
  const cut = script.cut!;
  return [
    "The exact same dish as image 1 (same recipe, same colours, same garnish, same surface and warm light),",
    `but whole and untouched, before the first portion is served: ${cut.vessel}.`,
    `${cut.start}`,
    "Vertical 9:16 three-quarter view, close enough to fill the frame. Real home kitchen table.",
    NO_TEXT,
  ].join(" ");
}

/** Coupe, image d'arrivée (image 1 = départ, image 2 = photo du plat) : la part soulevée. */
export function cutEndPrompt(script: LayerScript): string {
  const cut = script.cut!;
  return [
    "Exactly the same shot as image 1: same dish, same framing, same light, same surface.",
    `Now a clean portion has been cut and is lifted on a spatula just above the dish: ${cut.end}`,
    `The cut side faces the camera and shows, from bottom to top: ${cut.strata.join(", ")}.`,
    "Gentle steam rises. The food looks exactly like the finished dish in image 2.",
    NO_TEXT,
  ].join(" ");
}

export function cutMotion(script: LayerScript): string {
  return (
    `${script.cut!.motion} Slow motion, static camera, steam rising, realistic food textures, ` +
    "natural sound of the knife and the bubbling dish."
  );
}

/** Geste, image de départ (image 1 = photo du plat). */
export function gestureStartPrompt(script: LayerScript): string {
  return [
    "The exact same dish as image 1 (same container, same presentation, same surface and warm light),",
    `in a vertical 9:16 close-up, just before the finishing touch: ${script.gesture!.start}`,
    "Only hands and utensils, never a face.",
    NO_TEXT,
  ].join(" ");
}

/** Geste, image d'arrivée (image 1 = départ, image 2 = photo du plat). */
export function gestureEndPrompt(script: LayerScript): string {
  return [
    "Exactly the same close-up as image 1: same dish, same framing, same light.",
    `Right after the finishing touch: ${script.gesture!.end}`,
    "The dish now looks exactly like the finished dish in image 2.",
    NO_TEXT,
  ].join(" ");
}

export function gestureMotion(script: LayerScript): string {
  return `${script.gesture!.motion} Slow motion close-up, static camera, glossy realistic textures, natural sound.`;
}
