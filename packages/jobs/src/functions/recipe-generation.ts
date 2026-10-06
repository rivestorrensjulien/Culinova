import { inngest } from "../client";

export const RECIPE_GENERATION_EVENT = "recipe/generation.requested";

/**
 * Tâche de génération de recette. La logique métier est fournie par
 * l'application (accès base et IA) : ce paquet ne fait que l'orchestration.
 */
export function createRecipeGenerationFunction(run: (generationId: string) => Promise<string>) {
  return inngest.createFunction(
    {
      id: "recipe-generation",
      triggers: [{ event: RECIPE_GENERATION_EVENT }],
      // L'exécution gère elle-même ses échecs (quota rendu, erreur affichée) : une seule relance technique.
      retries: 1,
      concurrency: { limit: 5 },
    },
    async ({ event, step }) => {
      const generationId = (event.data as { generationId: string }).generationId;
      const outcome = await step.run("generer-la-recette", () => run(generationId));
      return { generationId, outcome };
    },
  );
}
