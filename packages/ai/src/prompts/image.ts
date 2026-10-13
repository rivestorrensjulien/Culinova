/**
 * Prompt photo d'une recette, dérivé de son dressage. Claude rédige un prompt
 * photographique en anglais pour FLUX ; à défaut, un gabarit simple sert de repli.
 */
import { z } from "zod";

export const IMAGE_PROMPT_VERSION = "image.prompt@6";

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

export const IMAGE_PROMPT_SYSTEM = `You write prompts for a photorealistic image model (FLUX). From a recipe and its plating, write ONE prompt in English, 90 to 150 words, that reads like the caption of a candid lifestyle photograph taken by a food photographer at a real table, during a warm, convivial moment: the dish is the hero, but life is happening around it. Plain factual sentences with concrete nouns, not a list of adjectives: the model renders lists of qualities as an illustration.

Rules:
- Start with "Photo of" followed by the dish and its defining look. Authenticity first: identify the dish (name, cuisine, steps) and how it really looks when made traditionally (surface, shape, colour, thickness, which side faces up, how it is cooked) and describe these features physically, as matter, never as a pattern or print. Example for Moroccan baghrir (crêpes mille trous): thick, soft, spongy semolina pancakes about 5 mm thick, like large blinis or crumpets, never thin or lacy like a French crêpe, never rolled; cooked on one side only and laid flat, holes side up, slightly overlapping or in a low stack; the pale yellow top full of small open holes of uneven sizes that do not go through, no browning on top, smooth rounded edges, a lightly golden underside just visible on the edge. A croissant shows flaky laminated layers; a Basque cheesecake has a deeply burnt top.
- Show the plating described (container, sauce, garnish), arranged casually as a cook would really serve it: a few overlapping pieces, a loose stack, one piece torn or already bitten (fold or roll only what is really served folded or rolled), never a geometric ring, rosette or symmetrical layout. Only ingredients that are in the recipe may be on the dish.
- Life and warmth around the dish: a lived-in table set for sharing, with two or three props that belong to the cuisine and the moment (e.g. for a Moroccan goûter: glasses of mint tea, a brass teapot, a small bowl of honey with a spoon, an embroidered linen cloth), a crumpled napkin, a few crumbs and a drip on the cloth, props partly cut by the frame or softly blurred in the background. A guest's hand may reach in from the edge, out of focus. Warm late-afternoon daylight, golden tones, gentle real shadows.
- Camera: three-quarter angle, about 35 degrees above the table (never straight overhead), 50mm lens at f/2, focus on the front of the dish, background melting into soft bokeh, natural colours, light film grain, the look of an unretouched photograph.
- Setting consistent with the moment and the container (street food on kraft paper at a busy counter, a sharing dessert on a weathered wooden table, a plated dish on linen in a bistro). Never a plain white round plate unless the plating says so.
- The whole dish visible near the centre with room around it, so it can be cropped to square, 4:5, 9:16 and 16:9.
- No text, letters or logos, no faces. Never use the words "perfect", "flawless", "hyper-detailed", "pattern", "dots", "honeycomb" or "illustration".
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
  if (words < 30) return [`prompt trop court (${words} mots) : vise 90 à 150 mots.`];
  if (words > 200) return [`prompt trop long (${words} mots) : vise 90 à 150 mots.`];
  return [];
}

/** Repli sans IA : un prompt simple construit à partir du dressage. */
export function fallbackImagePrompt(input: ImagePromptInput): string {
  const plating = input.plating;
  return [
    `Photo of "${input.name}"${input.cuisine ? ` (${input.cuisine})` : ""}.`,
    plating?.description?.trim() || [plating?.plate, plating?.positioning].filter(Boolean).join(", "),
    plating?.garnish ? `Garnish: ${plating.garnish}.` : "",
    "Candid lifestyle photograph at a real table: natural textures with small imperfections, casual arrangement, a lived-in table set for sharing with a crumpled napkin and a few crumbs, warm late-afternoon daylight, gentle real shadows, natural colours, three-quarter angle about 35 degrees above the table, 50mm lens at f/2, background in soft bokeh, light film grain, dish fully visible near the centre, no text, no logo, no faces.",
  ]
    .filter(Boolean)
    .join(" ");
}
