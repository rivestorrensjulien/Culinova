/**
 * Ingrédients courants du référentiel global (sans prix : les prix arrivent au jalon J3).
 * Allergènes : les 14 allergènes majeurs du règlement UE 1169/2011.
 */
import type { Labels } from "./reference";

export const ALLERGENS = [
  "gluten",
  "crustaceans",
  "eggs",
  "fish",
  "peanuts",
  "soy",
  "milk",
  "nuts",
  "celery",
  "mustard",
  "sesame",
  "sulphites",
  "lupin",
  "molluscs",
] as const;
export type Allergen = (typeof ALLERGENS)[number];

export const INGREDIENT_CATEGORIES: Array<{ code: string } & Labels> = [
  { code: "vegetables", fr: "Légumes", en: "Vegetables" },
  { code: "fruits", fr: "Fruits", en: "Fruit" },
  { code: "herbs_spices", fr: "Herbes et épices", en: "Herbs & spices" },
  { code: "dairy", fr: "Produits laitiers", en: "Dairy" },
  { code: "eggs", fr: "Œufs", en: "Eggs" },
  { code: "meat", fr: "Viandes", en: "Meat" },
  { code: "poultry", fr: "Volailles", en: "Poultry" },
  { code: "seafood", fr: "Poissons et fruits de mer", en: "Fish & seafood" },
  { code: "grains", fr: "Céréales, farines et pâtes", en: "Grains, flours & pasta" },
  { code: "legumes", fr: "Légumineuses", en: "Pulses" },
  { code: "nuts_seeds", fr: "Fruits secs et graines", en: "Nuts & seeds" },
  { code: "fats_oils", fr: "Matières grasses", en: "Fats & oils" },
  { code: "sugars", fr: "Sucres et produits sucrants", en: "Sugars & sweeteners" },
  { code: "condiments", fr: "Condiments et sauces", en: "Condiments & sauces" },
  { code: "liquids", fr: "Liquides et boissons", en: "Liquids & drinks" },
  { code: "pastry", fr: "Pâtisserie", en: "Baking" },
];

type Kind = "plant" | "dairy" | "egg" | "meat" | "fish";

export interface IngredientSeed extends Labels {
  code: string;
  category: string;
  unit: "g" | "ml" | "piece";
  kind: Kind;
  allergens?: Allergen[];
  /** g/ml, pour les liquides. */
  density?: number;
  /** Poids moyen d'une pièce, en grammes. */
  pieceWeight?: number;
}

/** Régimes déduits de la nature de l'ingrédient et de ses allergènes. */
export function dietsFor(seed: IngredientSeed): string[] {
  const diets: string[] = [];
  if (seed.kind === "plant") diets.push("vegan", "vegetarian");
  if (seed.kind === "dairy" || seed.kind === "egg") diets.push("vegetarian");
  const allergens = seed.allergens ?? [];
  if (!allergens.includes("gluten")) diets.push("gluten_free");
  if (!allergens.includes("milk")) diets.push("lactose_free");
  return diets;
}

const i = (
  code: string,
  fr: string,
  en: string,
  category: string,
  unit: IngredientSeed["unit"],
  kind: Kind,
  extra: Partial<IngredientSeed> = {},
): IngredientSeed => ({ code, fr, en, category, unit, kind, ...extra });

export const INGREDIENTS: IngredientSeed[] = [
  // Légumes
  i("onion", "Oignon", "Onion", "vegetables", "g", "plant", { pieceWeight: 150 }),
  i("shallot", "Échalote", "Shallot", "vegetables", "g", "plant", { pieceWeight: 30 }),
  i("garlic", "Ail", "Garlic", "vegetables", "g", "plant", { pieceWeight: 5 }),
  i("carrot", "Carotte", "Carrot", "vegetables", "g", "plant", { pieceWeight: 120 }),
  i("potato", "Pomme de terre", "Potato", "vegetables", "g", "plant", { pieceWeight: 170 }),
  i("tomato", "Tomate", "Tomato", "vegetables", "g", "plant", { pieceWeight: 120 }),
  i("zucchini", "Courgette", "Courgette", "vegetables", "g", "plant", { pieceWeight: 250 }),
  i("eggplant", "Aubergine", "Aubergine", "vegetables", "g", "plant", { pieceWeight: 300 }),
  i("bell_pepper", "Poivron", "Bell pepper", "vegetables", "g", "plant", { pieceWeight: 160 }),
  i("leek", "Poireau", "Leek", "vegetables", "g", "plant", { pieceWeight: 250 }),
  i("celery", "Céleri branche", "Celery", "vegetables", "g", "plant", { allergens: ["celery"] }),
  i("celeriac", "Céleri-rave", "Celeriac", "vegetables", "g", "plant", { allergens: ["celery"] }),
  i("mushroom", "Champignon de Paris", "Button mushroom", "vegetables", "g", "plant"),
  i("spinach", "Épinard", "Spinach", "vegetables", "g", "plant"),
  i("squash", "Potimarron", "Red kuri squash", "vegetables", "g", "plant", { pieceWeight: 1200 }),
  i("cucumber", "Concombre", "Cucumber", "vegetables", "g", "plant", { pieceWeight: 300 }),
  i("fennel", "Fenouil", "Fennel", "vegetables", "g", "plant", { pieceWeight: 250 }),
  i("cauliflower", "Chou-fleur", "Cauliflower", "vegetables", "g", "plant"),
  i("ginger", "Gingembre frais", "Fresh ginger", "vegetables", "g", "plant"),
  // Fruits
  i("lemon", "Citron jaune", "Lemon", "fruits", "piece", "plant", { pieceWeight: 120 }),
  i("lime", "Citron vert", "Lime", "fruits", "piece", "plant", { pieceWeight: 70 }),
  i("orange", "Orange", "Orange", "fruits", "piece", "plant", { pieceWeight: 200 }),
  i("apple", "Pomme", "Apple", "fruits", "g", "plant", { pieceWeight: 180 }),
  i("pear", "Poire", "Pear", "fruits", "g", "plant", { pieceWeight: 180 }),
  i("strawberry", "Fraise", "Strawberry", "fruits", "g", "plant"),
  i("raspberry", "Framboise", "Raspberry", "fruits", "g", "plant"),
  i("banana", "Banane", "Banana", "fruits", "g", "plant", { pieceWeight: 120 }),
  // Herbes et épices
  i("parsley", "Persil plat", "Flat-leaf parsley", "herbs_spices", "g", "plant"),
  i("coriander_leaf", "Coriandre fraîche", "Fresh coriander", "herbs_spices", "g", "plant"),
  i("basil", "Basilic", "Basil", "herbs_spices", "g", "plant"),
  i("chive", "Ciboulette", "Chives", "herbs_spices", "g", "plant"),
  i("thyme", "Thym", "Thyme", "herbs_spices", "g", "plant"),
  i("bay_leaf", "Laurier", "Bay leaf", "herbs_spices", "g", "plant"),
  i("salt", "Sel fin", "Fine salt", "herbs_spices", "g", "plant"),
  i("fleur_de_sel", "Fleur de sel", "Fleur de sel", "herbs_spices", "g", "plant"),
  i("black_pepper", "Poivre noir", "Black pepper", "herbs_spices", "g", "plant"),
  i("cumin", "Cumin", "Cumin", "herbs_spices", "g", "plant"),
  i("paprika", "Paprika", "Paprika", "herbs_spices", "g", "plant"),
  i("espelette", "Piment d'Espelette", "Espelette pepper", "herbs_spices", "g", "plant"),
  i("cinnamon", "Cannelle", "Cinnamon", "herbs_spices", "g", "plant"),
  i("vanilla_pod", "Gousse de vanille", "Vanilla pod", "herbs_spices", "piece", "plant", { pieceWeight: 3 }),
  i("saffron", "Safran", "Saffron", "herbs_spices", "g", "plant"),
  // Produits laitiers et œufs
  i("butter", "Beurre doux", "Unsalted butter", "dairy", "g", "dairy", { allergens: ["milk"] }),
  i("salted_butter", "Beurre demi-sel", "Salted butter", "dairy", "g", "dairy", { allergens: ["milk"] }),
  i("milk", "Lait entier", "Whole milk", "dairy", "ml", "dairy", { allergens: ["milk"], density: 1.03 }),
  i("cream", "Crème liquide 30 %", "Whipping cream (30%)", "dairy", "ml", "dairy", {
    allergens: ["milk"],
    density: 1.01,
  }),
  i("creme_fraiche", "Crème fraîche épaisse", "Crème fraîche", "dairy", "g", "dairy", {
    allergens: ["milk"],
  }),
  i("parmesan", "Parmigiano Reggiano", "Parmesan", "dairy", "g", "dairy", { allergens: ["milk"] }),
  i("comte", "Comté", "Comté cheese", "dairy", "g", "dairy", { allergens: ["milk"] }),
  i("mozzarella", "Mozzarella", "Mozzarella", "dairy", "g", "dairy", {
    allergens: ["milk"],
    pieceWeight: 125,
  }),
  i("goat_cheese", "Fromage de chèvre frais", "Fresh goat's cheese", "dairy", "g", "dairy", {
    allergens: ["milk"],
  }),
  i("yogurt", "Yaourt nature", "Plain yogurt", "dairy", "g", "dairy", {
    allergens: ["milk"],
    pieceWeight: 125,
  }),
  i("egg", "Œuf", "Egg", "eggs", "piece", "egg", { allergens: ["eggs"], pieceWeight: 55 }),
  // Viandes, volailles, poissons
  i("chicken_breast", "Blanc de poulet", "Chicken breast", "poultry", "g", "meat"),
  i("chicken_thigh", "Cuisse de poulet", "Chicken thigh", "poultry", "g", "meat"),
  i("duck_breast", "Magret de canard", "Duck breast", "poultry", "g", "meat"),
  i("beef_chuck", "Paleron de bœuf", "Beef chuck", "meat", "g", "meat"),
  i("beef_tenderloin", "Filet de bœuf", "Beef tenderloin", "meat", "g", "meat"),
  i("veal_shoulder", "Épaule de veau", "Veal shoulder", "meat", "g", "meat"),
  i("pork_belly", "Poitrine de porc", "Pork belly", "meat", "g", "meat"),
  i("lamb_shoulder", "Épaule d'agneau", "Lamb shoulder", "meat", "g", "meat"),
  i("salmon", "Pavé de saumon", "Salmon fillet", "seafood", "g", "fish", { allergens: ["fish"] }),
  i("cod", "Dos de cabillaud", "Cod loin", "seafood", "g", "fish", { allergens: ["fish"] }),
  i("tuna", "Thon rouge", "Bluefin tuna", "seafood", "g", "fish", { allergens: ["fish"] }),
  i("prawn", "Crevette", "Prawn", "seafood", "g", "fish", { allergens: ["crustaceans"] }),
  i("scallop", "Noix de Saint-Jacques", "Scallop", "seafood", "g", "fish", { allergens: ["molluscs"] }),
  i("mussel", "Moule", "Mussel", "seafood", "g", "fish", { allergens: ["molluscs"] }),
  // Céréales, farines, pâtes, légumineuses
  i("wheat_flour", "Farine de blé T55", "Plain flour", "grains", "g", "plant", { allergens: ["gluten"] }),
  i("buckwheat_flour", "Farine de sarrasin", "Buckwheat flour", "grains", "g", "plant"),
  i("cornstarch", "Fécule de maïs", "Cornflour", "grains", "g", "plant"),
  i("rice_arborio", "Riz arborio", "Arborio rice", "grains", "g", "plant"),
  i("rice_basmati", "Riz basmati", "Basmati rice", "grains", "g", "plant"),
  i("rice_sushi", "Riz à sushi", "Sushi rice", "grains", "g", "plant"),
  i("dry_pasta", "Pâtes sèches", "Dried pasta", "grains", "g", "plant", { allergens: ["gluten"] }),
  i("breadcrumbs", "Chapelure", "Breadcrumbs", "grains", "g", "plant", { allergens: ["gluten"] }),
  i("semolina", "Semoule de blé", "Wheat semolina", "grains", "g", "plant", { allergens: ["gluten"] }),
  i("lentils", "Lentilles vertes", "Green lentils", "legumes", "g", "plant"),
  i("chickpeas", "Pois chiches", "Chickpeas", "legumes", "g", "plant"),
  i("tofu", "Tofu ferme", "Firm tofu", "legumes", "g", "plant", { allergens: ["soy"] }),
  // Fruits secs et graines
  i("almond", "Amande", "Almond", "nuts_seeds", "g", "plant", { allergens: ["nuts"] }),
  i("almond_powder", "Poudre d'amande", "Ground almonds", "nuts_seeds", "g", "plant", {
    allergens: ["nuts"],
  }),
  i("hazelnut", "Noisette", "Hazelnut", "nuts_seeds", "g", "plant", { allergens: ["nuts"] }),
  i("walnut", "Noix", "Walnut", "nuts_seeds", "g", "plant", { allergens: ["nuts"] }),
  i("peanut", "Cacahuète", "Peanut", "nuts_seeds", "g", "plant", { allergens: ["peanuts"] }),
  i("sesame_seed", "Graines de sésame", "Sesame seeds", "nuts_seeds", "g", "plant", {
    allergens: ["sesame"],
  }),
  // Matières grasses
  i("olive_oil", "Huile d'olive vierge extra", "Extra virgin olive oil", "fats_oils", "ml", "plant", {
    density: 0.91,
  }),
  i("sunflower_oil", "Huile de tournesol", "Sunflower oil", "fats_oils", "ml", "plant", { density: 0.92 }),
  i("sesame_oil", "Huile de sésame", "Sesame oil", "fats_oils", "ml", "plant", {
    allergens: ["sesame"],
    density: 0.92,
  }),
  // Sucres et pâtisserie
  i("sugar", "Sucre en poudre", "Caster sugar", "sugars", "g", "plant"),
  i("icing_sugar", "Sucre glace", "Icing sugar", "sugars", "g", "plant"),
  i("brown_sugar", "Cassonade", "Brown sugar", "sugars", "g", "plant"),
  i("honey", "Miel", "Honey", "sugars", "g", "plant"),
  i("dark_chocolate", "Chocolat noir 70 %", "Dark chocolate (70%)", "pastry", "g", "plant", {
    allergens: ["soy"],
  }),
  i("cocoa_powder", "Cacao en poudre", "Cocoa powder", "pastry", "g", "plant"),
  i("gelatin", "Gélatine en feuilles", "Gelatine leaves", "pastry", "g", "meat", { pieceWeight: 2 }),
  i("baking_powder", "Levure chimique", "Baking powder", "pastry", "g", "plant"),
  // Condiments et sauces
  i("dijon_mustard", "Moutarde de Dijon", "Dijon mustard", "condiments", "g", "plant", {
    allergens: ["mustard"],
  }),
  i("soy_sauce", "Sauce soja", "Soy sauce", "condiments", "ml", "plant", {
    allergens: ["soy", "gluten"],
    density: 1.15,
  }),
  i("fish_sauce", "Sauce poisson (nuoc-mâm)", "Fish sauce", "condiments", "ml", "fish", {
    allergens: ["fish"],
    density: 1.2,
  }),
  i("miso", "Miso blanc", "White miso", "condiments", "g", "plant", { allergens: ["soy"] }),
  i("wine_vinegar", "Vinaigre de vin", "Wine vinegar", "condiments", "ml", "plant", {
    allergens: ["sulphites"],
    density: 1.01,
  }),
  i("tomato_paste", "Concentré de tomate", "Tomato paste", "condiments", "g", "plant"),
  i("coconut_milk", "Lait de coco", "Coconut milk", "condiments", "ml", "plant", { density: 0.97 }),
  // Liquides
  i("water", "Eau", "Water", "liquids", "ml", "plant", { density: 1 }),
  i("white_wine", "Vin blanc sec", "Dry white wine", "liquids", "ml", "plant", {
    allergens: ["sulphites"],
    density: 0.99,
  }),
  i("red_wine", "Vin rouge", "Red wine", "liquids", "ml", "plant", {
    allergens: ["sulphites"],
    density: 0.99,
  }),
  i("chicken_stock", "Fond blanc de volaille", "Chicken stock", "liquids", "ml", "meat", { density: 1 }),
  i("vegetable_stock", "Bouillon de légumes", "Vegetable stock", "liquids", "ml", "plant", {
    allergens: ["celery"],
    density: 1,
  }),
];
