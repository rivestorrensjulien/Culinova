/**
 * Mise en pages du carrousel Instagram d'une recette : 4 images au plus (1080 × 1350),
 * pour donner envie sans tout dévoiler : photo de couverture → ingrédients pesés → la recette
 * en bref (étapes résumées, sans quantités) → carte de fin qui renvoie au lien de la bio
 * (page publique de la recette, avec le pas à pas complet). Logique pure, testée.
 */
import { ingredientsIntro } from "./actions.ts";
import type { Jacket } from "./Mascot.tsx";

export const CAROUSEL_ID = "CarrouselInstagram";
export const CAROUSEL_WIDTH = 1080;
export const CAROUSEL_HEIGHT = 1350;
export const MAX_SLIDES = 4;
/** Chef Ju en 3D (fond transparent), dans public/. */
export const MASCOT_3D = "mascotte-3d.png";
/** Ingrédients montrés sur une seule image (deux colonnes) ; au-delà, « + N autres ». */
export const MAX_INGREDIENTS = 16;
/** Lignes de « la recette en bref ». */
export const MAX_SUMMARY = 8;
const SUMMARY_LENGTH = 90;

export interface CarouselProps {
  name: string;
  /** Nom de la couverture, 5 mots au plus (calculé par Culinova ; sinon tiré du nom). */
  shortName?: string;
  servings: number;
  totalMinutes: number;
  /** Temps lisible calculé par Culinova (« 1 h 30 », « 20 min + 2 h au frais »). */
  timeLabel?: string;
  ingredients: Array<{ label: string; amount: string }>;
  steps: string[];
  /** Étapes résumées (lignes courtes du script TikTok) ; sinon, tirées des étapes. */
  summary?: string[];
  /** Photo 4:5 de la recette (lien temporaire, ou « static:fichier »). */
  photoUrl: string;
  handle: string;
  site: string;
  jacket: Jacket;
  /** Image à dessiner (0 = couverture). */
  page: number;
  [key: string]: unknown;
}

/** Nom de la couverture : celui de Culinova, sinon la partie avant la première virgule ou parenthèse. */
export function coverName(props: Pick<CarouselProps, "name" | "shortName">): string {
  if (props.shortName?.trim()) return props.shortName.trim();
  const head = props.name.split(/\s*(?:,|\(|:|\s[–—-]\s)\s*/)[0]?.trim() || props.name;
  return head.split(/\s+/).slice(0, 5).join(" ");
}

/** Temps affiché : celui de Culinova, sinon « 1 h 30 » d'après le total. */
export function timeText(props: Pick<CarouselProps, "totalMinutes" | "timeLabel">): string {
  if (props.timeLabel?.trim()) return props.timeLabel.trim();
  const total = Math.max(0, Math.round(props.totalMinutes));
  if (total < 60) return `${total} min`;
  const rest = total % 60;
  return rest
    ? `${Math.floor(total / 60)} h ${String(rest).padStart(2, "0")}`
    : `${Math.floor(total / 60)} h`;
}

export type CarouselPage =
  | { kind: "cover" }
  | { kind: "ingredients"; items: CarouselProps["ingredients"]; more: number }
  | { kind: "summary"; items: string[]; total: number }
  | { kind: "end" };

/** Première phrase d'une étape, raccourcie (sans les quantités entre parenthèses). */
function shortStep(text: string): string {
  const plain = text
    .replace(/\s*\([^)]*\)/g, "")
    .replace(/\s+/g, " ")
    .trim();
  const first = plain.split(/(?<=[.!?])\s/)[0] ?? plain;
  if (first.length <= SUMMARY_LENGTH) return first.replace(/[.\s]+$/, "");
  const cut = first.slice(0, SUMMARY_LENGTH);
  return `${cut.slice(0, cut.lastIndexOf(" ")).replace(/[,;:\s]+$/, "")}…`;
}

/** Lignes de « la recette en bref » : le script (sans la ligne des ingrédients), sinon les étapes. */
export function summaryLines(props: Pick<CarouselProps, "steps" | "summary">): string[] {
  const script = (props.summary ?? [])
    .map((line) => line.trim())
    .filter((line) => line && !ingredientsIntro(line));
  const lines = script.length >= 3 ? script : props.steps.map(shortStep);
  return lines.map((line) => line.replace(/[.\s]+$/, ""));
}

export function carouselPages(
  props: Pick<CarouselProps, "ingredients" | "steps" | "summary">,
): CarouselPage[] {
  const tooMany = props.ingredients.length > MAX_INGREDIENTS;
  const shown = tooMany ? props.ingredients.slice(0, MAX_INGREDIENTS - 1) : props.ingredients;
  const lines = summaryLines(props);
  return [
    { kind: "cover" },
    { kind: "ingredients", items: shown, more: props.ingredients.length - shown.length },
    { kind: "summary", items: lines.slice(0, MAX_SUMMARY), total: lines.length },
    { kind: "end" },
  ];
}

export const EXAMPLE_CAROUSEL: CarouselProps = {
  name: "Baghrir, beurre fondu au miel",
  shortName: "Baghrir",
  servings: 4,
  totalMinutes: 45,
  timeLabel: "15 min + 30 min de repos",
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
