import { inngest } from "../client";

/** Tâche de démonstration (J0) : vérifie que la file de tâches répond. */
export const healthcheck = inngest.createFunction(
  { id: "system-healthcheck", triggers: [{ event: "system/healthcheck" }] },
  async ({ step }) => {
    const checkedAt = await step.run("horodatage", () => new Date().toISOString());
    return { ok: true, checkedAt };
  },
);
