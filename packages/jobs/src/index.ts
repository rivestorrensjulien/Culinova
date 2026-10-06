import { healthcheck } from "./functions/healthcheck";

export { inngest } from "./client";
export { createRecipeGenerationFunction, RECIPE_GENERATION_EVENT } from "./functions/recipe-generation";

/** Fonctions sans dépendance applicative. */
export const baseFunctions = [healthcheck];
