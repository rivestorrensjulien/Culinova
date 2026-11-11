/**
 * Paramètres de création transmis aux moteurs (recette, contenu social, et plus
 * tard image). Ce ne sont pas des filtres cosmétiques : chacun participe à la
 * construction de la recette.
 */
export type RecipeLanguage = "fr" | "en";

export interface CuisineContext {
  label: string;
  /** Pays et région de rattachement, pour situer la cuisine. */
  country: string | null;
  region: string | null;
  description: string | null;
  signatureIngredients: string[];
  techniques: string[];
  spices: string[];
  referenceDishes: string[];
}

export interface RecipeRequest {
  moment: string;
  /** Influence large (zone ou transversale), null = aucune. */
  influence: string | null;
  /** Région / pays choisis sans cuisine précise. */
  region: string | null;
  country: string | null;
  /** Une cuisine, ou plusieurs pour une fusion. */
  cuisines: CuisineContext[];
  style: { code: "light" | "marked" | "traditional" | "creative"; label: string; description: string | null };
  language: RecipeLanguage;
  mode: "ingredients" | "name" | "idea";
  /** Ingrédients disponibles (avec quantités éventuelles), nom de recette ou idée. */
  input: string;
  servings: number;
  constraints: { diets: string[]; allergens: string[]; dislikedIngredients: string[] };
  /**
   * Contraintes d'un particulier (parcours court) : budget par personne, temps disponible,
   * niveau et appareils. Absent pour le parcours pro.
   */
  household?: {
    budgetPerServingCents: number | null;
    maxMinutes: number | null;
    level: "beginner" | "comfortable" | "confident" | null;
    /** Libellés des appareils disponibles (plaques, four…). */
    equipment: string[];
  };
}

/** Une recette est une fusion dès que plusieurs cuisines sont choisies. */
export function isFusion(request: RecipeRequest): boolean {
  return request.cuisines.length > 1;
}
