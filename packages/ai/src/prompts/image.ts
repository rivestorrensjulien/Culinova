/**
 * Prompt photo d'une recette, dérivé de son dressage. Claude rédige un prompt
 * photographique en anglais pour FLUX ; à défaut, un gabarit simple sert de repli.
 */
import { z } from "zod";

export const IMAGE_PROMPT_VERSION = "image.prompt@3";

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

export const IMAGE_PROMPT_SYSTEM = `You write prompts for a photorealistic food photography model (FLUX). From a recipe and its plating, write ONE prompt in English, 80 to 140 words, describing a single real photograph of the finished dish, as if shot by a professional food photographer for a cookbook.

Rules:
- Authenticity first. Identify the dish (its name, cuisine and steps) and how it really looks when made traditionally: its signature surface, shape, colour, thickness and cross-section, which side faces up, how it is cooked. Describe these defining visual features explicitly, in the first sentence, and never contradict them. Examples: Moroccan baghrir (crêpes mille trous) are pale yellow semolina pancakes cooked on one side only, served holes side up, the whole top covered with hundreds of tiny open holes, spongy, with no browning on top; a croissant shows flaky laminated layers; a Basque cheesecake has a deeply burnt top.
- Show exactly the plating described: the serving container (material, shape, colour), the arrangement, sauce, garnish and finish. Only ingredients that are in the recipe may be visible.
- Realism first: describe the real, tangible texture of each visible component (crisp caramelised edges, the crumb and slight wrinkles of bread, fibres of slow-cooked meat, glossy versus matte sauces, fresh herbs with tiny imperfections, coarse salt crystals, a few natural crumbs or drips). Natural irregular shapes, nothing perfectly symmetrical or smooth.
- Light and camera: soft natural side light from a window, gentle real shadows, true-to-life colours, slightly muted rather than saturated. Shot on a full-frame camera with an 85mm lens at f/2.8, shallow depth of field, subtle film grain, sharp focus on the food.
- Setting consistent with the moment and the container (e.g. street food on kraft paper or a worn wooden board, a sharing dessert on a weathered wooden table, a plated dish on a linen tablecloth), with honest materials showing wear and grain. Never a plain white round plate unless the plating says so.
- Composition: the dish fully visible and centred, seen from a 45-degree angle (or from above for flat dishes), with generous empty space all around, so the image can be cropped to square, 4:5, 9:16 and 16:9 without cutting the food.
- No text, no letters, no logos, no labels, no hands, no people, no cutlery brand. Do not use words such as "perfect", "flawless" or "hyper-detailed".
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
  if (words < 30) return [`prompt trop court (${words} mots) : vise 80 à 140 mots.`];
  if (words > 200) return [`prompt trop long (${words} mots) : vise 80 à 140 mots.`];
  return [];
}

/** Repli sans IA : un prompt simple construit à partir du dressage. */
export function fallbackImagePrompt(input: ImagePromptInput): string {
  const plating = input.plating;
  return [
    `Professional editorial food photograph of "${input.name}"${input.cuisine ? ` (${input.cuisine})` : ""}.`,
    plating?.description?.trim() || [plating?.plate, plating?.positioning].filter(Boolean).join(", "),
    plating?.garnish ? `Garnish: ${plating.garnish}.` : "",
    "Real cookbook photograph: natural textures with small imperfections, soft side light from a window, gentle shadows, true-to-life slightly muted colours, 85mm lens at f/2.8, shallow depth of field, subtle film grain, dish fully visible and centred with generous empty space around, 45-degree angle, no text, no logo, no hands.",
  ]
    .filter(Boolean)
    .join(" ");
}
