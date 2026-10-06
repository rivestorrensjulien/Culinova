import { healthcheck } from "./functions/healthcheck";

export { inngest } from "./client";

/** Toutes les fonctions à exposer via la route /api/inngest. */
export const functions = [healthcheck];
