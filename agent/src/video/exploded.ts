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

/** Couches renvoyées par Culinova (GET /api/agent/couches). */
export interface LayerScript {
  container: string;
  layered: boolean;
  layers: Array<{ name: string; look: string }>;
}

export interface ExplodedProps extends VideoProps {
  /** Clip : la photo du plat dont les couches s'écartent. */
  explodeClip: string | null;
  /** Vues du dessus : 0 = contenant vide, puis une image par couche posée. */
  topViews: string[];
  layerNames: string[];
  /** Clip : Chef Ju fait le baiser du chef et dit « Et voilà ! » (avec le son). */
  voilaClip: string | null;
}

export const PHOTO_FRAMES = 66;
export const EXPLODE_FRAMES = 120;
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

export function explodedTimeline(props: Pick<ExplodedProps, "layerNames">): ExplodedSegment[] {
  const frames: Array<[ExplodedKind, number]> = [
    ["photo", PHOTO_FRAMES],
    ["explode", EXPLODE_FRAMES],
    ["assemble", EMPTY_FRAMES + props.layerNames.length * LAYER_FRAMES],
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

export function explodedFrames(props: Pick<ExplodedProps, "layerNames">): number {
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
