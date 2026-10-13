/**
 * Prompt photo d'une recette, dérivé de son dressage. Claude rédige un prompt
 * photographique en anglais pour FLUX ; à défaut, un gabarit simple sert de repli.
 */
import { z } from "zod";

export const IMAGE_PROMPT_VERSION = "image.prompt@4";

export interface ImagePromptInput {
  name: string;
  description: string | null;
  cuisine: string | null;
  moment: string | null;
  ingredients: string[];
  /** Étapes de la recette (consigne et résultat attendu), pour savoir à quoi ressemble le plat fini. */
  steps?: string[];
  plating: {
    description?: string | null;
    plate: string;
    positioning: string;
    garnish: string | null;
    sauce: string | null;
    finish: string | null;
    decoration: string | null;
  } | null;
}

export const IMAGE_PROMPT_SYSTEM = `You write prompts for a photorealistic food photography model (FLUX, raw mode). From a recipe and its plating, write ONE prompt in English, 70 to 120 words, that reads like the caption of a real photograph taken by a food photographer on location. Plain factual sentences with concrete nouns, not a list of adjectives: the model renders lists of qualities as an illustration.

Rules:
- Start with "Photo of" followed by the dish and its defining look. Authenticity first: identify the dish (name, cuisine, steps) and how it really looks when made traditionally (surface, shape, colour, thickness, which side faces up, how it is cooked) and describe these features physically, as matter, never as a pattern or print. Example for Moroccan baghrir (crêpes mille trous): pale yellow semolina pancakes cooked on one side only, holes side up, the top a spongy honeycomb of open craters of uneven sizes whose inner walls catch the light, no browning on top, a lightly golden underside visible on a folded edge, edges thin and ragged. A croissant shows flaky laminated layers; a Basque cheesecake has a deeply burnt top.
- Show the plating described (container, sauce, garnish), but arranged casually as a cook would really serve it: a few overlapping pieces, a loose stack, one piece folded or torn, never a geometric ring, rosette or symmetrical pattern, never dozens of identical copies. Only ingredients that are in the recipe may be visible.
- Real imperfections: uneven sizes and edges, a drip or smear of sauce, a few crumbs, slight shine where fat or syrup sits, matte where it does not.
- Camera: seen from a three-quarter angle, about 35 degrees above the table (never straight overhead), 85mm lens at f/2.8, focus on the front of the dish, background softly out of focus. Soft daylight from a side window, real soft shadows, natural slightly muted colours, light film grain.
- Setting consistent with the moment and the container (street food on kraft paper or a worn board, a sharing dessert on a weathered wooden table, a plated dish on linen), with honest materials showing wear. Never a plain white round plate unless the plating says so.
- The whole dish visible with empty space around it, so it can be cropped to square, 4:5, 9:16 and 16:9.
- No text, letters, logos, hands or people. Never use the words "perfect", "flawless", "hyper-detailed", "pattern", "dots" or "illustration".
Return only the prompt.`;

export const imagePromptSchema = z.object({ prompt: z.string() });

export function buildImagePrompt(input: ImagePromptInput): { system: string; user: string } {
  return {
    system: IMAGE_PROMPT_SYSTEM,
    user: `Recipe:\n${JSON.stringify(input, null, 2)}`,
  };
}

export function imagePromptProblems(data: z.infer<typeof imagePromptSchema>): string[] {
  const words = data.prompt.trim().split(/\s+/).filter(Boolean).length;
  if (words < 30) return [`prompt trop court (${words} mots) : vise 70 à 120 mots.`];
  if (words > 180) return [`prompt trop long (${words} mots) : vise 70 à 120 mots.`];
  return [];
}

/** Repli sans IA : un prompt simple construit à partir du dressage. */
export function fallbackImagePrompt(input: ImagePromptInput): string {
  const plating = input.plating;
  return [
    `Photo of "${input.name}"${input.cuisine ? ` (${input.cuisine})` : ""}.`,
    plating?.description?.trim() || [plating?.plate, plating?.positioning].filter(Boolean).join(", "),
    plating?.garnish ? `Garnish: ${plating.garnish}.` : "",
    "Real cookbook photograph: natural textures with small imperfections, soft side light from a window, gentle shadows, true-to-life slightly muted colours, 85mm lens at f/2.8, shallow depth of field, subtle film grain, casual natural arrangement, three-quarter angle about 35 degrees above the table, dish fully visible with empty space around, no text, no logo, no hands.",
  ]
    .filter(Boolean)
    .join(" ");
}
