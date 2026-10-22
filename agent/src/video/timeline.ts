/**
 * Déroulé de la vidéo d'une recette (30 images par seconde, format 9:16) :
 * accroche → un plan par étape du script TikTok → la photo du plat → carte de fin.
 * Logique pure, testée sans rendu.
 */
import type { Expression, Jacket } from "./Mascot.tsx";

export const COMPOSITION_ID = "RecetteVerticale";
export const FPS = 30;
export const WIDTH = 1080;
export const HEIGHT = 1920;

export interface VideoProps {
  /** Nom de la recette. */
  name: string;
  /** Accroche (0-3 s) du script TikTok. */
  hook: string;
  /** Plans du script TikTok, dans l'ordre des étapes, sans le préfixe « Plan n : ». */
  shots: string[];
  /**
   * Photo 9:16 du plat (lien temporaire, ou « static:fichier » dans agent/public) ;
   * sans photo, la carte de fin suit directement.
   */
  photoUrl: string | null;
  handle: string;
  site: string;
  jacket: Jacket;
  /** Fichier de musique dans agent/public (libre de droits), ou null. */
  music: string | null;
  /** Voix de Julien à la fin (« Et voilà, y'a plus qu'à se régaler ! », fichier de agent/public), ou null. */
  voice?: string | null;
  /** Chef Ju en 3D, bras croisés, pour la carte de fin (fichier de agent/public), sinon le dessin. */
  endMascot?: string | null;
  [key: string]: unknown;
}

export const HOOK_FRAMES = 96;
export const REVEAL_FRAMES = 120;
export const END_FRAMES = 120;

/** Durée d'un plan : le temps de lire la phrase et de voir le geste (5 images par mot), entre 2,4 et 3,5 s. */
export function shotFrames(text: string): number {
  const words = text.split(/\s+/).filter(Boolean).length;
  return Math.min(105, Math.max(72, 40 + words * 5));
}

const SHOT_EXPRESSIONS: Expression[] = ["idee", "content", "clin", "content", "waouh", "idee"];

/** Expression de la mascotte pour le plan n (le dernier plan, le dressage, est « fier »). */
export function shotExpression(index: number, count: number): Expression {
  if (index === count - 1) return "fier";
  return SHOT_EXPRESSIONS[index % SHOT_EXPRESSIONS.length]!;
}

export interface Segment {
  kind: "hook" | "shot" | "reveal" | "end";
  from: number;
  frames: number;
  /** Rang du plan (segments « shot »). */
  index?: number;
}

export function timeline(props: Pick<VideoProps, "shots" | "photoUrl" | "hook">): Segment[] {
  const segments: Segment[] = [];
  let from = 0;
  const push = (segment: Omit<Segment, "from">) => {
    segments.push({ ...segment, from });
    from += segment.frames;
  };
  push({ kind: "hook", frames: Math.max(HOOK_FRAMES, shotFrames(props.hook) + 30) });
  props.shots.forEach((text, index) => push({ kind: "shot", frames: shotFrames(text), index }));
  if (props.photoUrl) push({ kind: "reveal", frames: REVEAL_FRAMES });
  push({ kind: "end", frames: END_FRAMES });
  return segments;
}

export function totalFrames(props: Pick<VideoProps, "shots" | "photoUrl" | "hook">): number {
  return timeline(props).reduce((sum, s) => sum + s.frames, 0);
}

export const EXAMPLE_PROPS: VideoProps = {
  name: "Baghrir, beurre fondu au miel",
  hook: "Les crêpes mille trous les plus moelleuses, sans levure chimique",
  shots: [
    "Disposer la semoule, la farine, la levure et le miel",
    "Mixer la semoule fine, la farine et l'eau tiède",
    "Laisser reposer la pâte jusqu'à ce qu'elle bulle",
    "Cuire d'un seul côté dans une poêle bien chaude",
    "Faire fondre le beurre avec le miel",
    "Napper les baghrir encore tièdes de beurre au miel",
    "Dresser les baghrir en pile sur la planche en bois",
  ],
  photoUrl: null,
  handle: "@culinova.recette",
  site: "culinova.fr",
  jacket: "blanche",
  music: null,
  voice: "voix/et-voila.mp3",
};

/** Volume normal de la musique de fond, et pendant la voix de Julien (la voix reste devant). */
export const MUSIC_VOLUME = 0.22;
export const MUSIC_UNDER_VOICE = 0.06;

/**
 * Volume de la musique à l'image `frame` : arrivée douce, baisse pendant la voix ([début, fin]),
 * fondu final.
 */
export function musicVolume(frame: number, total: number, voice: [number, number] | null): number {
  const fadeIn = Math.min(1, frame / 15);
  const fadeOut = Math.min(1, Math.max(0, (total - frame) / 24));
  let level = MUSIC_VOLUME;
  if (voice) {
    const [from, to] = voice;
    const down = Math.min(1, Math.max(0, (frame - (from - 8)) / 8));
    const up = Math.min(1, Math.max(0, (frame - to) / 12));
    const ducked = down * (1 - up);
    level = MUSIC_VOLUME - (MUSIC_VOLUME - MUSIC_UNDER_VOICE) * ducked;
  }
  return level * fadeIn * fadeOut;
}

/** Durée de la voix de Julien (« Et voilà, y'a plus qu'à se régaler ! »), en images. */
export const VOICE_FRAMES = 106;
