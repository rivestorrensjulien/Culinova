/**
 * Prompt photo d'une recette, dérivé de son dressage. Claude rédige un prompt
 * photographique en anglais pour FLUX ; à défaut, un gabarit simple sert de repli.
 */
import { z } from "zod";

export const IMAGE_PROMPT_VERSION = "image.prompt@1";

export interface ImagePromptInput {
  name: string;
  description: string | null;
  cuisine: string | null;
  moment: string | null;
  ingredients: string[];
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

export const IMAGE_PROMPT_SYSTEM = `You write prompts for a food photography image model (FLUX). From a recipe and its plating, write ONE prompt in English, 60 to 120 words, describing a single photograph of the finished dish.

Rules:
- Show exactly the plating described: the serving container (material, shape, colour), the arrangement, sauce, garnish and finish. Only ingredients that are in the recipe may be visible.
- Premium, warm, gastronomic editorial style: natural soft daylight, shallow depth of field, appetising textures, true-to-life colours, styled but believable.
- Setting consistent with the moment and the container (e.g. street food on kraft paper or a wooden board, a sharing dessert on a wooden table, a plated dish on a linen tablecloth). Never a plain white round plate unless the plating says so.
- Composition: the dish fully visible and centred, seen from a 45-degree angle (or from above for flat dishes), with generous empty space all around, so the image can be cropped to square, 4:5, 9:16 and 16:9 without cutting the food.
- No text, no letters, no logos, no labels, no hands, no people, no cutlery brand.
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
  if (words < 30) return [`prompt trop court (${words} mots) : vise 60 à 120 mots.`];
  if (words > 180) return [`prompt trop long (${words} mots) : vise 60 à 120 mots.`];
  return [];
}

/** Repli sans IA : un prompt simple construit à partir du dressage. */
export function fallbackImagePrompt(input: ImagePromptInput): string {
  const plating = input.plating;
  return [
    `Professional editorial food photograph of "${input.name}"${input.cuisine ? ` (${input.cuisine})` : ""}.`,
    plating?.description?.trim() || [plating?.plate, plating?.positioning].filter(Boolean).join(", "),
    plating?.garnish ? `Garnish: ${plating.garnish}.` : "",
    "Natural soft daylight, shallow depth of field, warm and appetising, dish fully visible and centred with generous empty space around, 45-degree angle, no text, no logo, no hands.",
  ]
    .filter(Boolean)
    .join(" ");
}
