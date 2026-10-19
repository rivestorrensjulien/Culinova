/**
 * Mise en pages du carrousel Instagram d'une recette (10 images au plus, 1080 × 1350) :
 * photo de couverture → ingrédients pesés → étapes → carte de fin. Logique pure, testée.
 */
import type { Jacket } from "./Mascot.tsx";

export const CAROUSEL_ID = "CarrouselInstagram";
export const CAROUSEL_WIDTH = 1080;
export const CAROUSEL_HEIGHT = 1350;
export const MAX_SLIDES = 10;
const INGREDIENTS_PER_PAGE = 11;
const MAX_INGREDIENT_PAGES = 2;

export interface CarouselProps {
  name: string;
  servings: number;
  totalMinutes: number;
  ingredients: Array<{ label: string; amount: string }>;
  steps: string[];
  /** Photo 4:5 de la recette (lien temporaire, ou « static:fichier »). */
  photoUrl: string;
  handle: string;
  site: string;
  jacket: Jacket;
  /** Image à dessiner (0 = couverture). */
  page: number;
  [key: string]: unknown;
}

export type CarouselPage =
  | { kind: "cover" }
  | { kind: "ingredients"; items: CarouselProps["ingredients"]; part: number; parts: number }
  | { kind: "steps"; items: Array<{ number: number; text: string }>; more: boolean }
  | { kind: "end" };

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/** Étapes regroupées par page, sans dépasser `budget` caractères (3 étapes au plus par page). */
function stepPages(steps: string[], budget: number) {
  const pages: Array<Array<{ number: number; text: string }>> = [];
  let current: Array<{ number: number; text: string }> = [];
  let length = 0;
  steps.forEach((text, index) => {
    if (current.length > 0 && (length + text.length > budget || current.length >= 3)) {
      pages.push(current);
      current = [];
      length = 0;
    }
    current.push({ number: index + 1, text });
    length += text.length;
  });
  if (current.length > 0) pages.push(current);
  return pages;
}

export function carouselPages(props: Pick<CarouselProps, "ingredients" | "steps">): CarouselPage[] {
  const ingredientChunks = chunk(props.ingredients, INGREDIENTS_PER_PAGE).slice(0, MAX_INGREDIENT_PAGES);
  const room = MAX_SLIDES - 2 - ingredientChunks.length;
  const numbered = props.steps.map((text, index) => ({ number: index + 1, text }));
  let steps = stepPages(props.steps, 420);
  if (steps.length > room) steps = stepPages(props.steps, 700);
  // Toujours trop long : pages régulières, 5 étapes au plus (au-delà, « la suite sur culinova.fr »).
  if (steps.length > room) steps = chunk(numbered, Math.min(5, Math.ceil(numbered.length / room)));
  const more = steps.length > room;
  const kept = steps.slice(0, room);
  const parts = ingredientChunks.length;
  const ingredientPages: CarouselPage[] = ingredientChunks.map((items, part) => {
    return { kind: "ingredients", items, part, parts };
  });
  const stepPagesKept: CarouselPage[] = kept.map((items, index) => {
    return { kind: "steps", items, more: more && index === kept.length - 1 };
  });
  return [{ kind: "cover" }, ...ingredientPages, ...stepPagesKept, { kind: "end" }];
}

export const EXAMPLE_CAROUSEL: CarouselProps = {
  name: "Baghrir, beurre fondu au miel",
  servings: 4,
  totalMinutes: 45,
  ingredients: [
    { label: "Semoule fine", amount: "250 g" },
    { label: "Farine de blé", amount: "60 g" },
    { label: "Eau tiède", amount: "500 g" },
    { label: "Levure boulangère sèche", amount: "6 g (1 sachet)" },
    { label: "Levure chimique", amount: "5 g (1 c. à café)" },
    { label: "Sel", amount: "3 g (1 pincée)" },
    { label: "Beurre", amount: "60 g" },
    { label: "Miel", amount: "80 g (4 c. à soupe)" },
  ],
  steps: [
    "Mixer la semoule fine (250 g), la farine de blé (60 g), les levures et le sel avec l'eau tiède (500 g) pendant 2 minutes.",
    "Laisser reposer la pâte 30 minutes, jusqu'à ce que des bulles apparaissent à la surface.",
    "Cuire une louche de pâte dans une poêle bien chaude, d'un seul côté, jusqu'à ce que la surface soit sèche et criblée de trous.",
    "Faire fondre le beurre (60 g) avec le miel (80 g) à feu doux.",
    "Napper les baghrir encore tièdes du beurre au miel et servir aussitôt.",
  ],
  photoUrl: "static:exemple-4x5.jpg",
  handle: "@culinova.recette",
  site: "culinova.fr",
  jacket: "blanche",
  page: 0,
};
