/**
 * Prompt photo d'une recette, dérivé de son dressage. Claude rédige un prompt
 * photographique en anglais pour FLUX ; à défaut, un gabarit simple sert de repli.
 */
import { z } from "zod";

export const IMAGE_PROMPT_VERSION = "image.prompt@10";

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
  /**
   * Décor tiré au sort pour cette photo (`pickPhotoDecor` de @culinova/core, décision de Julien
   * du 28/11 : varier fonds, contenants, couleurs et angles du fil Instagram).
   */
  scene?: { surface: string; container: string; light: string; camera: string } | null;
}

export const IMAGE_PROMPT_SYSTEM = `You write prompts for a photorealistic image model (FLUX). From a recipe and its plating, write ONE prompt in English, 90 to 150 words, that reads like the caption of a candid lifestyle photograph taken by a food photographer at a real table, during a warm, convivial moment: the dish is the hero, but life is happening around it. Plain factual sentences with concrete nouns, not a list of adjectives: the model renders lists of qualities as an illustration.

Rules:
- Start with "Photo of" followed by the dish and its defining look. Authenticity first: identify the dish (name, cuisine, steps) and how it really looks when made traditionally (surface, shape, colour, thickness, which side faces up, how it is cooked) and describe these features physically, as matter, never as a pattern or print. Example for Moroccan baghrir (crêpes mille trous): thick, soft, spongy semolina pancakes about 5 mm thick, like large blinis or crumpets, never thin or lacy like a French crêpe, never rolled; cooked on one side only and laid flat, holes side up, slightly overlapping or in a low stack; the pale yellow top full of small open holes of uneven sizes that do not go through, no browning on top, smooth rounded edges, a lightly golden underside just visible on the edge. A croissant shows flaky laminated layers; a Basque cheesecake has a deeply burnt top. A rum baba (baba au rhum) is a yeast-raised brioche-like cake, never a muffin or a cupcake: a tall cork-shaped cylinder or a savarin ring with straight smooth sides and no paper case or pleats, a deep amber-golden, very glossy apricot-glazed crust, its outside smooth and evenly lacquered like a glazed brioche, with no holes, craters or sponge texture on the surface; the airy, syrup-soaked crumb shows only where the baba is cut open, usually split lengthwise or halved on top with a generous swirl of piped Chantilly cream in the cut. Vanilla seeds (vanilla cream, Chantilly, ice cream, custard) are mixed into the cream, barely visible as a few very fine specks inside it, smaller than poppy seeds; never seeds, pepper or black dots sprinkled on top of the cream, never large black dots, chips or spots. A Vietnamese bánh mì is a short single-serving Vietnamese baguette about 20 cm long, much lighter and airier than a French baguette, with a thin, crackly, pale golden blistered crust, split lengthwise along one side (not cut through) and generously stuffed so the filling is the first thing you see: the protein, pickled carrot and daikon matchsticks, cucumber, fresh coriander, chilli slices spilling from the opening. For any sandwich, burger, wrap or filled bread, show the open side and its filling clearly; never a plain closed bread roll. Name the dish's local name and origin (e.g. "Vietnamese bánh mì") so it is not mistaken for a similar Western dish.
- Show the plating described (container, sauce, garnish), arranged casually as a cook would really serve it: a few overlapping pieces, a loose stack, at most one small piece torn off a dish served for sharing (fold or roll only what is really served folded or rolled). The dish itself is whole and untouched: never a bite mark, never a bitten sandwich, burger, bao or pastry, never a geometric ring, rosette or symmetrical layout. Only ingredients that are in the recipe may be on the dish. Small vessels for sauce, honey or condiments also belong to the cuisine (e.g. a terracotta or hand-painted Moroccan ceramic bowl, a Japanese stoneware dish, an enamel cup): never a plain white fluted ramekin.
- Life and warmth around the dish: a lived-in table set for sharing, with two or three props that belong to the cuisine and the moment (e.g. for a Moroccan goûter: glasses of mint tea, a brass teapot, a small bowl of honey with a spoon, an embroidered linen cloth), a crumpled napkin, a few crumbs and a drip on the cloth, props partly cut by the frame or softly blurred in the background. A guest's hand may reach in from the edge, out of focus. Light: as given in "scene" (without a scene: warm late-afternoon daylight, golden tones, gentle real shadows).
- Camera: as given in "scene" (without a scene: three-quarter angle, about 35 degrees above the table, 50mm lens at f/2, background in soft bokeh); focus on the dish, natural colours, light film grain, the look of an unretouched photograph.
- Scene (when given): it is drawn at random so that consecutive photos never look alike, so follow it exactly. The table surface is "scene.surface". Serve the dish in "scene.container", replacing any wooden board, plate or bowl named in the plating; keep the plating's own container only when the dish cannot be served otherwise (a glass, verrine or jar, kraft paper or a paper cone, a bamboo steamer basket, the cooking vessel it is baked or simmered in), then place it on the given surface. Props, napkin and background match the surface and light: a bright scene stays bright, never a dark wooden background in a light scene.
- Setting consistent with the moment and the container (street food on kraft paper at a busy counter, a sharing dessert at a family table, a plated dish in a bistro), on the scene's surface when one is given. Never a plain white round plate unless the plating says so.
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
    input.scene
      ? `Served in ${input.scene.container}, on ${input.scene.surface}. Candid lifestyle photograph: natural textures with small imperfections, casual arrangement, a crumpled napkin and a few crumbs, ${input.scene.light}, natural colours, ${input.scene.camera}, light film grain, dish fully visible near the centre, no text, no logo, no faces.`
      : "Candid lifestyle photograph at a real table: natural textures with small imperfections, casual arrangement, a lived-in table set for sharing with a crumpled napkin and a few crumbs, warm late-afternoon daylight, gentle real shadows, natural colours, three-quarter angle about 35 degrees above the table, 50mm lens at f/2, background in soft bokeh, light film grain, dish fully visible near the centre, no text, no logo, no faces.",
  ]
    .filter(Boolean)
    .join(" ");
}
