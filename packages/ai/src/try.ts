/**
 * Essai d'une vraie génération avec Claude : `pnpm ai:essai`.
 * Nécessite ANTHROPIC_API_KEY dans le .env à la racine. Coûte quelques centimes.
 */
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { AnthropicAdapter } from "./anthropic";
import { buildRecipePrompt, RECIPE_PROMPT_VERSION } from "./prompts/recipe";
import type { RecipeRequest } from "./prompts/request";
import { generatedRecipeSchema, recipeProblems } from "./schemas";

const envFile = fileURLToPath(new URL("../../../.env", import.meta.url));
if (existsSync(envFile)) process.loadEnvFile(envFile);
if (!process.env.ANTHROPIC_API_KEY) {
  console.error("ANTHROPIC_API_KEY n'est pas définie dans le fichier .env à la racine.");
  process.exit(1);
}

const request: RecipeRequest = {
  moment: "Plat",
  influence: "Asie",
  region: "Asie de l'Est",
  country: "Japon",
  cuisines: [
    {
      label: "Japonaise",
      country: "Japon",
      region: "Asie de l'Est",
      description: "Cuisine de saison et d'umami, précise et épurée, qui respecte le produit.",
      signatureIngredients: ["dashi", "sauce soja", "miso", "mirin", "riz", "algues"],
      techniques: ["grillade yakimono", "cuisson mijotée nimono", "friture tempura", "découpe"],
      spices: ["shichimi", "sansho", "wasabi", "gingembre"],
      referenceDishes: ["sushi", "ramen", "tempura", "okonomiyaki"],
    },
  ],
  style: {
    code: "creative",
    label: "Interprétation créative",
    description: "Une relecture libre, toujours présentée comme telle.",
  },
  language: "fr",
  mode: "idea",
  input: process.argv[2] ?? "Un plat réconfortant pour l'automne",
  servings: 4,
  constraints: { diets: [], allergens: [], dislikedIngredients: [] },
};

const adapter = new AnthropicAdapter({ model: process.env.AI_RECIPE_MODEL || undefined });
console.log("Génération en cours (Claude)…");
const result = await adapter.generateStructured({
  promptId: RECIPE_PROMPT_VERSION,
  ...buildRecipePrompt(request),
  schema: generatedRecipeSchema,
  validate: (recipe) => recipeProblems(recipe, request.servings),
});
console.log(JSON.stringify(result.data, null, 2));
console.log(
  `\n✓ ${result.data.name}\n  ${result.usage.inputTokens} jetons en entrée, ${result.usage.outputTokens} en sortie, ` +
    `${result.usage.attempts} appel(s), ${(result.usage.durationMs / 1000).toFixed(1)} s, ` +
    `coût ${(result.usage.costUsdMicros / 1_000_000).toFixed(4)} $`,
);
