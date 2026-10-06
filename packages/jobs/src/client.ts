import { Inngest } from "inngest";

/**
 * Client Inngest (tâches longues : génération de recettes et d'images, recalcul des coûts…).
 * Les clés (INNGEST_EVENT_KEY, INNGEST_SIGNING_KEY) sont lues dans l'environnement.
 */
export const inngest = new Inngest({ id: "culinova" });
