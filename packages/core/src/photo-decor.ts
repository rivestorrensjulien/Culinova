/**
 * Décor des photos de recettes (décision de Julien du 28/11, plaquette « Nouveau fil Instagram ») :
 * chaque photo tire au sort un fond, un contenant, une couleur globale et un angle, pour que le
 * fil Instagram ne soit plus une suite de bois sombre en lumière de fin de journée.
 * Règles du tirage :
 * - jamais le même fond ni le même contenant que les 3 photos précédentes ;
 * - jamais la même couleur globale ni le même angle que les 2 précédentes ;
 * - sur 3 photos d'affilée, au moins une claire et au plus une sombre.
 * Logique pure : le hasard est injecté (`random`) pour les tests.
 */

export type PhotoTone = "clair" | "moyen" | "sombre";

export interface DecorOption {
  id: string;
  /** Nom affiché (français). */
  label: string;
  /** Description envoyée au rédacteur du prompt photo (anglais). */
  prompt: string;
  tone?: PhotoTone;
}

export const PHOTO_BACKGROUNDS: DecorOption[] = [
  {
    id: "chene",
    label: "Chêne blond",
    tone: "clair",
    prompt: "a pale blond oak table with fine natural grain",
  },
  {
    id: "marbre",
    label: "Marbre blanc",
    tone: "clair",
    prompt: "a white Carrara marble worktop with soft grey veins",
  },
  {
    id: "lin",
    label: "Lin naturel",
    tone: "clair",
    prompt: "a table covered with a natural oatmeal linen cloth, gently creased",
  },
  { id: "beton", label: "Béton clair", tone: "moyen", prompt: "a light grey polished concrete counter" },
  {
    id: "terracotta",
    label: "Terracotta",
    tone: "moyen",
    prompt: "a terracotta tiled table in warm burnt-orange tones",
  },
  {
    id: "zellige",
    label: "Zellige vert",
    tone: "moyen",
    prompt: "a table of glossy sage-green zellige tiles with slightly uneven edges",
  },
  { id: "pierre", label: "Pierre bleue", tone: "sombre", prompt: "a dark blue-grey bluestone slab" },
  { id: "noyer", label: "Noyer", tone: "sombre", prompt: "a dark walnut wooden table, weathered" },
];

/** Contenants tirés au sort ; verre, bocal, kraft, bambou ou plat de cuisson restent ceux du dressage. */
export const PHOTO_CONTAINERS: DecorOption[] = [
  { id: "planche-chene", label: "Planche en chêne clair", prompt: "a light oak serving board" },
  { id: "planche-olivier", label: "Planche en olivier", prompt: "an olive-wood board with swirling grain" },
  {
    id: "ceramique-blanche",
    label: "Céramique blanche mate",
    prompt: "a matte off-white handmade ceramic plate or bowl with an irregular rim",
  },
  { id: "gres-bleu", label: "Grès bleu", prompt: "a deep blue glazed stoneware plate or bowl" },
  {
    id: "email-vert",
    label: "Assiette émaillée vert d'eau",
    prompt: "a pale celadon green enamel plate or bowl",
  },
  { id: "ardoise", label: "Ardoise", prompt: "a slate serving board" },
  { id: "terre-cuite", label: "Plat en terre cuite", prompt: "an unglazed terracotta serving dish" },
];

export const PHOTO_MOODS: DecorOption[] = [
  {
    id: "matin",
    label: "Matin lumineux",
    tone: "clair",
    prompt:
      "bright, airy morning daylight from a window, soft cool-neutral tones, light and fresh overall, gentle soft shadows",
  },
  {
    id: "studio",
    label: "Studio clair",
    tone: "clair",
    prompt:
      "clean, bright diffused daylight, neutral whites and light tones, minimal soft shadows, an uncluttered light background",
  },
  {
    id: "mediterranee",
    label: "Méditerranée",
    tone: "moyen",
    prompt:
      "sunny midday Mediterranean light, crisp natural colours, lively warm and cool contrasts, crisp short shadows",
  },
  {
    id: "fin-de-journee",
    label: "Fin de journée",
    tone: "sombre",
    prompt: "warm late-afternoon light, golden tones, a darker moody background, gentle real shadows",
  },
];

export const PHOTO_ANGLES: DecorOption[] = [
  {
    id: "dessus",
    label: "Vue du dessus",
    prompt: "shot straight overhead (flat lay), the dish centred with space around it",
  },
  {
    id: "trois-quarts",
    label: "Trois quarts",
    prompt:
      "three-quarter angle about 35 degrees above the table, 50mm lens at f/2, background in soft bokeh",
  },
  {
    id: "gros-plan",
    label: "Gros plan",
    prompt:
      "close-up at about 30 degrees, 85mm lens at f/2.8, the dish's textures filling most of the frame but still whole, background in soft bokeh",
  },
  {
    id: "hauteur-table",
    label: "À hauteur de table",
    prompt:
      "low angle almost at table height, about 15 degrees, 50mm lens at f/2, showing the dish's height and side",
  },
];

export interface PhotoDecor {
  background: string;
  container: string;
  mood: string;
  angle: string;
}

const RANK: Record<PhotoTone, number> = { clair: 0, moyen: 1, sombre: 2 };

function byId(list: DecorOption[], id: string): DecorOption | undefined {
  return list.find((option) => option.id === id);
}

/** Ton d'ensemble d'une photo : le plus sombre de son fond et de sa couleur globale. */
export function decorTone(decor: PhotoDecor): PhotoTone {
  const background = byId(PHOTO_BACKGROUNDS, decor.background)?.tone ?? "moyen";
  const mood = byId(PHOTO_MOODS, decor.mood)?.tone ?? "moyen";
  return RANK[background] >= RANK[mood] ? background : mood;
}

/** Lit un décor enregistré (sortie d'une génération) ; null s'il est absent ou inconnu. */
export function parseDecor(value: unknown): PhotoDecor | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  const decor = {
    background: String(v.background ?? ""),
    container: String(v.container ?? ""),
    mood: String(v.mood ?? ""),
    angle: String(v.angle ?? ""),
  };
  return byId(PHOTO_BACKGROUNDS, decor.background) && byId(PHOTO_MOODS, decor.mood) ? decor : null;
}

/**
 * Tire le décor de la prochaine photo. `recent` = décors des photos précédentes, la plus récente
 * d'abord. Si les règles ne laissent aucun choix (cas théorique), elles sont relâchées une à une.
 */
export function pickPhotoDecor(recent: PhotoDecor[], random: () => number = Math.random): PhotoDecor {
  const last3 = recent.slice(0, 3);
  const last2 = recent.slice(0, 2);
  const tones = last2.map(decorTone);
  const all: PhotoDecor[] = [];
  for (const background of PHOTO_BACKGROUNDS)
    for (const container of PHOTO_CONTAINERS)
      for (const mood of PHOTO_MOODS)
        for (const angle of PHOTO_ANGLES)
          all.push({ background: background.id, container: container.id, mood: mood.id, angle: angle.id });

  const rules: Array<(d: PhotoDecor) => boolean> = [
    (d) => !last3.some((r) => r.background === d.background),
    (d) => !last3.some((r) => r.container === d.container),
    (d) => !last2.some((r) => r.mood === d.mood),
    (d) => !last2.some((r) => r.angle === d.angle),
    (d) => {
      const window = [...tones, decorTone(d)];
      return window.includes("clair") || window.length < 3;
    },
    (d) => [...tones, decorTone(d)].filter((t) => t === "sombre").length <= 1,
  ];
  // Le plus important en dernier relâché : le ton, puis le fond.
  const relaxOrder = [3, 2, 1, 0, 5, 4];
  let active = rules.map((_, i) => i);
  let pool = all.filter((d) => active.every((i) => rules[i]!(d)));
  for (const drop of relaxOrder) {
    if (pool.length > 0) break;
    active = active.filter((i) => i !== drop);
    pool = all.filter((d) => active.every((i) => rules[i]!(d)));
  }
  if (pool.length === 0) pool = all;
  return pool[Math.min(pool.length - 1, Math.floor(random() * pool.length))]!;
}

/** Descriptions (anglais) du décor, pour le rédacteur du prompt photo. */
export function decorPrompt(decor: PhotoDecor): {
  surface: string;
  container: string;
  light: string;
  camera: string;
} {
  return {
    surface: byId(PHOTO_BACKGROUNDS, decor.background)?.prompt ?? PHOTO_BACKGROUNDS[0]!.prompt,
    container: byId(PHOTO_CONTAINERS, decor.container)?.prompt ?? PHOTO_CONTAINERS[0]!.prompt,
    light: byId(PHOTO_MOODS, decor.mood)?.prompt ?? PHOTO_MOODS[0]!.prompt,
    camera: byId(PHOTO_ANGLES, decor.angle)?.prompt ?? PHOTO_ANGLES[1]!.prompt,
  };
}
