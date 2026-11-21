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
  /** Servi chaud : seule condition pour la vapeur (absent d'une ancienne analyse : pas de vapeur). */
  hot?: boolean;
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
  /** Coupe : second plan, enchaîné après le premier (la part soulevée). */
  secondClip?: string | null;
  /**
   * Coupe et geste : image d'arrivée du clip, tenue à l'écran avant le plan suivant (retour de
   * Julien du 25/10 : ce qui tombe sur le plat reste visible jusqu'au changement de plan).
   */
  holdImage?: string | null;
  /** Vues du dessus : 0 = contenant vide, puis une image par couche posée. */
  topViews: string[];
  layerNames: string[];
  /** Clip : Chef Ju fait le baiser du chef et dit « Et voilà ! » (avec le son). */
  voilaClip: string | null;
}

export const PHOTO_FRAMES = 66;
export const EXPLODE_FRAMES = 120;
/** Geste : le clip de 5 s joué à vitesse normale. */
export const CLIP_FRAMES = 150;
/**
 * Coupe : deux plans de 5 s enchaînés. Le couteau légèrement accéléré, la part soulevée à vitesse
 * normale (retour de Julien du 21/11, pupusas : découpe saccadée quand les deux étaient accélérés).
 */
export const CUT_KNIFE_FRAMES = 120;
export const CUT_LIFT_FRAMES = 150;
export const CUT_FRAMES = CUT_KNIFE_FRAMES + CUT_LIFT_FRAMES;
/** Fondu entre la photo et le premier plan de la coupe, puis entre les deux plans. */
export const CUT_FADE_FRAMES = 10;
/** Tenue du résultat (image d'arrivée) à la fin du geste ou de la coupe, avant le plan suivant. */
export const HOLD_FRAMES = 30;
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
 * - coupe et geste : le clip (part soulevée ou geste) ;
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
        : format === "coupe"
          ? [["explode", CUT_FRAMES + HOLD_FRAMES]]
          : [["explode", CLIP_FRAMES + HOLD_FRAMES]];
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

/**
 * Coupe en deux plans enchaînés, toujours autour de la MÊME part :
 * 1. plat entier intact → le couteau découpe la part, qui reste en place ;
 * 2. la spatule soulève cette part ; le vide qu'elle laisse reste exactement à sa place.
 * Chaque image est fabriquée à partir de la précédente (même plat, même cadrage).
 * Retour de Julien du 21/11 (pupusas) : galettes et pains farcis coupés en deux, la moitié tirée
 * hors du plat avec le fromage de la farce qui file, jamais de fromage posé sur le dessus ; et le
 * plat entier garde le cadrage de la photo (une planche qui « apparaît » au début, c'est raté).
 */
export const CUT_PORTION =
  "the front-right corner portion of the dish (the corner closest to the camera, on the right)";
export const HALF_PORTION =
  "the front half of the piece closest to the camera (one straight cut through its centre)";

/** Galettes, pains et chaussons farcis : on coupe en deux une pièce, on ne découpe pas un coin. */
const FLAT_FILLED =
  /\b(pupusas?|quesadillas?|arepas?|galettes?|tortillas?|gözleme|gozleme|calzones?|croques?|paninis?|empanadas?|chaussons?|pitas?|naans?|flatbreads?|stuffed|filled|farcie?s?|fourrée?s?|pizzas?|crêpes?|crepes?|galettes? de sarrasin|burritos?|piadinas?|wraps?)\b/i;

/** Fromage fondu dans la farce : il doit filer entre la part et le plat. */
const STRETCHY =
  /\b(filant|qui file|fondu|stretch\w*|string\w*|melt\w*|mozzarella|quesillo|oaxaca|raclette|scamorza|provolone|comté|emmental|gruyère|cheddar|cheese pull)\b/i;

function cutText(script: LayerScript): string {
  const cut = script.cut!;
  return [script.container, cut.vessel, cut.start, cut.end, cut.motion, ...cut.strata].join(" ");
}

/** Part découpée : un coin du plat, ou la moitié avant d'une galette ou d'un pain farci. */
export function cutPortion(script?: LayerScript): string {
  return script?.cut && FLAT_FILLED.test(cutText(script)) ? HALF_PORTION : CUT_PORTION;
}

/** Le fromage de la farce file quand on soulève la part. */
export function cheesePull(script: LayerScript): boolean {
  return Boolean(script.cut) && STRETCHY.test(cutText(script)) && /fromage|cheese/i.test(cutText(script));
}

/** Image 1 = photo du plat. Le plat entier, intact : AUCUNE part retirée, même cadrage que la photo. */
export function cutStartPrompt(script: LayerScript): string {
  const cut = script.cut!;
  return [
    "The exact same dish as image 1 (same recipe, same colours, same garnish, same surface and warm light),",
    `but whole and completely untouched, just cooked, before serving: ${cut.vessel}.`,
    "Nothing has been cut or removed yet: the top surface is complete and unbroken from edge to edge,",
    "no missing portion, no slice on a plate, no gap, no knife mark.",
    "Same camera angle, same framing and same crop as image 1: do not zoom out, do not show more of the",
    "board, the table or the background than image 1 shows, no new object or prop in the frame.",
    "A clean knife may rest at the very edge of the frame only if there is room; never widen the shot for it.",
    "Vertical 9:16.",
    NO_TEXT,
  ].join(" ");
}

/** Image 1 = plat entier, image 2 = photo du plat. La part est découpée mais toujours en place. */
export function cutMidPrompt(script?: LayerScript): string {
  const portion = cutPortion(script);
  const lines =
    portion === HALF_PORTION ? "one clean straight knife cut now splits" : "two clean knife cuts now outline";
  return [
    "Exactly the same shot as image 1: same dish, same framing, same light, same surface, nothing moved.",
    `The only change: ${lines} ${portion}.`,
    "The cut portion is still fully in place inside the dish, nothing removed, no gap yet;",
    "only the thin cut line is visible, with a little filling or sauce at the cut.",
    "The tip of the metal spatula is slid just under that cut portion, ready to lift it.",
    NO_TEXT,
  ].join(" ");
}

/** Image 1 = part découpée, image 2 = photo du plat. La même part, soulevée. */
export function cutEndPrompt(script: LayerScript): string {
  const cut = script.cut!;
  const portion = cutPortion(script);
  const pull = cheesePull(script);
  return [
    "Exactly the same shot as image 1: same dish, same framing, same light, same surface.",
    `The cut portion (${portion}) is now lifted up out of the dish on the spatula, a hand's width above the`,
    "exact spot it came from. Where it was, there is now an empty space of exactly the same size and shape,",
    "showing the clean cut walls of the remaining dish. The rest of the dish is unchanged.",
    `The lifted portion's cut side faces the camera and shows, from bottom to top: ${cut.strata.join(", ")}.`,
    "The top of the lifted portion looks exactly like the top of the dish in image 1 (same crust, same",
    "colour, same garnish): nothing is added on top of it.",
    pull
      ? "Long strands of melted cheese from inside the filling stretch from the cut side of the lifted portion " +
        "down to the cut wall of the dish, thin and glossy. The cheese is inside the filling only: no cheese " +
        "melted or sprinkled on top of the portion."
      : "",
    `${cut.end}`,
    script.hot
      ? "Gentle steam rises. The food looks exactly like the finished dish in image 2."
      : "The dish is served cold: no steam, no smoke, no vapour. The food looks exactly like the finished dish in image 2.",
    NO_TEXT,
  ]
    .filter(Boolean)
    .join(" ");
}

/** Plan 1 : le couteau découpe la part, sans rien soulever. */
export const CUT_KNIFE_MOTION =
  `A hand holding a knife slices cleanly down through the dish in one smooth, continuous stroke, marking out ${CUT_PORTION}. ` +
  "The portion stays in place, nothing is lifted. Static camera, realistic food textures.";

/** Plan 1 selon le plat (un coin, ou la moitié d'une galette farcie). */
export function cutKnifeMotion(script?: LayerScript): string {
  return CUT_KNIFE_MOTION.replace(CUT_PORTION, cutPortion(script));
}

/** Plan 2 : la spatule soulève la part déjà découpée. */
export function cutMotion(script: LayerScript): string {
  const pull = cheesePull(script)
    ? "As it rises, melted cheese from inside the filling stretches into long strings between the portion " +
      "and the dish, getting longer and thinner; no cheese ever appears on top of the portion. "
    : "";
  return (
    "The spatula already under the cut portion lifts it up out of the dish in one smooth, steady slow-motion " +
    "movement, revealing its layers; " +
    pull +
    "the empty space it leaves stays exactly where the portion was, the rest of the dish does not move; " +
    "nothing on the dish disappears and nothing new appears. " +
    `${script.cut!.motion} Static camera, ${script.hot ? "steam rising" : "cold dish, no steam or smoke"}, realistic food textures.`
  );
}

/** À ajouter au négatif des deux plans de la coupe. */
export const CUT_NEGATIVE =
  "camera zoom out, camera movement, new objects sliding into the frame, cutting board appearing, " +
  "cheese on top of the portion, cheese appearing from nowhere, jerky motion, sudden jump, morphing food";

/** Geste, image de départ (image 1 = photo du plat). */
export function gestureStartPrompt(script: LayerScript): string {
  return [
    "The exact same dish as image 1 (same container, same presentation, same surface and warm light),",
    `in a vertical 9:16 close-up, just before the finishing touch: ${script.gesture!.start}`,
    "All solid garnishes of the finished dish (flowers, zest, nuts, seeds, herbs) are already in place;",
    "only the sauce, syrup or glaze is still missing.",
    "Only hands and utensils, never a face.",
    NO_TEXT,
  ].join(" ");
}

/** Geste, image d'arrivée (image 1 = départ, image 2 = photo du plat). */
export function gestureEndPrompt(script: LayerScript): string {
  return [
    "Exactly the same close-up as image 1: same dish, same framing, same light.",
    `Right after the finishing touch: ${script.gesture!.end}`,
    "The poured liquid is now on the food, glossy and clearly visible where it landed.",
    "Every solid garnish is exactly as in image 1: same number, same place; nothing has disappeared or moved.",
    "The dish now looks exactly like the finished dish in image 2.",
    NO_TEXT,
  ].join(" ");
}

export function gestureMotion(script: LayerScript): string {
  return (
    `${script.gesture!.motion} Only one continuous stream of liquid flows onto the food and stays there, ` +
    "clearly visible until the very end of the shot. Nothing else falls, no petals, flakes or particles in the air; " +
    "the garnishes already on the dish never move or vanish. " +
    "Slow motion close-up, static camera, glossy realistic textures."
  );
}
