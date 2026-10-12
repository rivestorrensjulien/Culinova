import { createLlmAdapter } from "@culinova/ai";
import { baseFunctions, createRecipeGenerationFunction, inngest } from "@culinova/jobs";
import { serve } from "inngest/next";
import { getDb } from "@/server/db";
import { runGeneration } from "@/server/generation/run";

// Une génération de recette peut durer plus d'une minute.
export const maxDuration = 300;

const recipeGeneration = createRecipeGenerationFunction((generationId) =>
  runGeneration(getDb(), createLlmAdapter(), generationId, { estimatePrices: true }),
);

export const { GET, POST, PUT } = serve({ client: inngest, functions: [...baseFunctions, recipeGeneration] });
