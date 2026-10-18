/**
 * Analyse des statistiques Instagram et TikTok de Culinova (@culinova.recette) :
 * ce qui marche, ce qui marche moins, et des propositions concrètes pour toucher plus de monde.
 */
import { z } from "zod";

export const INSIGHTS_PROMPT_VERSION = "insights.analyze@1";

export const INSIGHTS_SYSTEM_PROMPT = `Tu es responsable des réseaux sociaux d'une marque culinaire française (Culinova, compte @culinova.recette sur Instagram et TikTok). Chaque vidéo présente une recette : une mascotte (le chef Julien en version dessinée) réagit pendant que les étapes s'affichent, puis la photo du plat apparaît.

À partir des chiffres fournis (abonnés dans le temps, vues, portée, j'aime, commentaires, partages, enregistrements par publication, avec le nom de la recette, son moment, sa cuisine, sa durée et l'heure de publication), rédige une analyse utile et honnête :
- summary : 2 à 3 phrases sur la tendance générale (en citant les chiffres clés).
- strengths : ce qui fonctionne le mieux (2 à 4 points), chacun appuyé sur des chiffres.
- weaknesses : ce qui fonctionne moins bien (1 à 3 points).
- suggestions : 3 à 6 propositions concrètes et applicables la semaine suivante (type de recette, accroche, durée, heure et jour de publication, hashtags, régularité, appel à l'action, collaboration…), chacune avec un titre court, une explication et l'impact attendu (« fort », « moyen » ou « faible »).
- nextRecipes : 3 à 5 idées de recettes à publier ensuite, en cohérence avec ce qui marche.

Si les données sont trop peu nombreuses pour conclure (moins de 3 publications ou moins de 7 jours), dis-le clairement dans summary et propose plutôt un plan de démarrage. N'invente aucun chiffre. Écris en français, simplement, pour un chef qui n'est pas spécialiste du marketing.`;

export const insightsSchema = z.object({
  summary: z.string().min(1),
  strengths: z.array(z.string().min(1)).max(6),
  weaknesses: z.array(z.string().min(1)).max(5),
  suggestions: z
    .array(
      z.object({
        title: z.string().min(1),
        detail: z.string().min(1),
        impact: z.enum(["fort", "moyen", "faible"]),
      }),
    )
    .min(1)
    .max(8),
  nextRecipes: z.array(z.string().min(1)).max(8),
});

export type InsightsAnalysis = z.infer<typeof insightsSchema>;

export function buildInsightsPrompt(data: unknown): { system: string; user: string } {
  return {
    system: INSIGHTS_SYSTEM_PROMPT,
    user: `Statistiques (JSON) :\n${JSON.stringify(data, null, 2)}`,
  };
}
