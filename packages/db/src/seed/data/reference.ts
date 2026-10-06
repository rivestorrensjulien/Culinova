/** Données de référence : langues, moments, influences, styles. Libellés [fr, en]. */

export type Labels = { fr: string; en: string };
export type Described = Labels & { descFr?: string; descEn?: string };

export const LANGUAGES = [
  { code: "fr", name: "Français", isDefault: true, sortOrder: 1 },
  { code: "en", name: "English", isDefault: false, sortOrder: 2 },
];

export const MEAL_MOMENTS: Array<{ code: string } & Labels> = [
  { code: "starter", fr: "Entrée", en: "Starter" },
  { code: "main", fr: "Plat", en: "Main course" },
  { code: "dessert", fr: "Dessert", en: "Dessert" },
  { code: "street_food", fr: "Street food", en: "Street food" },
  { code: "breakfast", fr: "Petit-déjeuner", en: "Breakfast" },
  { code: "snack", fr: "Goûter", en: "Afternoon snack" },
  { code: "sweet_bite", fr: "Mignardise sucrée", en: "Sweet petit four" },
  { code: "savory_bite", fr: "Mignardise salée", en: "Savoury bite" },
];

export const INFLUENCES: Array<{ code: string; kind: "zone" | "transversal" } & Labels> = [
  { code: "europe", kind: "zone", fr: "Europe", en: "Europe" },
  { code: "asia", kind: "zone", fr: "Asie", en: "Asia" },
  { code: "americas", kind: "zone", fr: "Amériques", en: "Americas" },
  { code: "africa", kind: "zone", fr: "Afrique", en: "Africa" },
  { code: "middle_east", kind: "zone", fr: "Moyen-Orient", en: "Middle East" },
  { code: "mediterranean", kind: "transversal", fr: "Méditerranée", en: "Mediterranean" },
  { code: "fusion", kind: "transversal", fr: "Fusion", en: "Fusion" },
  { code: "international", kind: "transversal", fr: "Internationale", en: "International" },
  { code: "contemporary", kind: "transversal", fr: "Contemporaine", en: "Contemporary" },
];

export const STYLES: Array<{ code: string; allowsFusion: boolean } & Described> = [
  {
    code: "light",
    allowsFusion: true,
    fr: "Inspiration légère",
    en: "Light inspiration",
    descFr: "Quelques touches de la cuisine choisie sur une base familière.",
    descEn: "A few touches of the chosen cuisine on a familiar base.",
  },
  {
    code: "marked",
    allowsFusion: true,
    fr: "Influence marquée",
    en: "Strong influence",
    descFr: "Ingrédients, techniques et saveurs clairement issus de la cuisine choisie.",
    descEn: "Ingredients, techniques and flavours clearly drawn from the chosen cuisine.",
  },
  {
    code: "traditional",
    allowsFusion: false,
    fr: "Style traditionnel",
    en: "Traditional style",
    descFr: "Fidèle aux recettes et aux gestes de référence.",
    descEn: "Faithful to reference recipes and techniques.",
  },
  {
    code: "creative",
    allowsFusion: true,
    fr: "Interprétation créative",
    en: "Creative interpretation",
    descFr: "Une relecture libre, toujours présentée comme telle.",
    descEn: "A free reinterpretation, always presented as such.",
  },
];
