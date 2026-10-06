/**
 * Lance l'exécution d'une génération :
 * - avec Inngest (production, ou `INNGEST_DEV=1` en local) : tâche de fond fiable ;
 * - sinon : exécution directe après la réponse (développement, tests de bout en bout).
 */
import { createLlmAdapter } from "@culinova/ai";
import { inngest, RECIPE_GENERATION_EVENT } from "@culinova/jobs";
import { after } from "next/server";
import { getDb } from "../db";
import { runGeneration } from "./run";

export function usesInngest(): boolean {
  return Boolean(process.env.INNGEST_EVENT_KEY || process.env.INNGEST_DEV);
}

export async function dispatchGeneration(generationId: string): Promise<void> {
  if (usesInngest()) {
    await inngest.send({ name: RECIPE_GENERATION_EVENT, data: { generationId } });
    return;
  }
  after(async () => {
    await runGeneration(getDb(), createLlmAdapter(), generationId);
  });
}
