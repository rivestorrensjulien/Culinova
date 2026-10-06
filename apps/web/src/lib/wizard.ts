/**
 * État du wizard de création (partagé navigateur / serveur).
 * Le brouillon est enregistré tel quel ; il n'est validé strictement qu'au
 * lancement de la génération.
 */
import { DEFAULT_SERVINGS } from "@culinova/core";
import { z } from "zod";

/** Les 12 étapes du parcours (la 12e, la sauvegarde, est continue). */
export const WIZARD_STEPS = [
  "moment",
  "influence",
  "precision",
  "style",
  "language",
  "mode",
  "input",
  "servings",
  "generation",
  "result",
  "social",
  "saved",
] as const;
export type WizardStepKey = (typeof WIZARD_STEPS)[number];

/** Nombre maximal de cuisines pour une fusion. */
export const MAX_FUSION_CUISINES = 3;
export const MAX_INPUT_LENGTH = 2000;

export const wizardStateSchema = z.object({
  /** Étape affichée (1 à 12). */
  step: z.number().int().min(1).max(WIZARD_STEPS.length).catch(1),
  momentCode: z.string().nullable().catch(null),
  /** null = pas encore choisi ; "none" = aucune influence. */
  influenceCode: z.string().nullable().catch(null),
  regionCode: z.string().nullable().catch(null),
  countryIso: z.string().nullable().catch(null),
  cuisineCodes: z.array(z.string()).max(MAX_FUSION_CUISINES).catch([]),
  styleCode: z.enum(["light", "marked", "traditional", "creative"]).nullable().catch(null),
  language: z.enum(["fr", "en"]).catch("fr"),
  mode: z.enum(["ingredients", "name", "idea"]).nullable().catch(null),
  input: z.string().max(MAX_INPUT_LENGTH).catch(""),
  servings: z.number().int().min(1).max(200).catch(DEFAULT_SERVINGS),
});

export type WizardState = z.infer<typeof wizardStateSchema>;

export function emptyWizardState(language: "fr" | "en" = "fr"): WizardState {
  return {
    step: 1,
    momentCode: null,
    influenceCode: null,
    regionCode: null,
    countryIso: null,
    cuisineCodes: [],
    styleCode: null,
    language,
    mode: null,
    input: "",
    servings: DEFAULT_SERVINGS,
  };
}

/** Lit un brouillon enregistré (données non fiables) en corrigeant les valeurs invalides. */
export function parseWizardState(value: unknown, language: "fr" | "en" = "fr"): WizardState {
  const result = wizardStateSchema.safeParse({ ...emptyWizardState(language), ...(value as object) });
  return result.success ? result.data : emptyWizardState(language);
}

export type MissingField = "moment" | "influence" | "style" | "mode" | "input";

/** Champs encore manquants pour lancer la génération (vide = prêt). */
export function missingFields(state: WizardState): MissingField[] {
  const missing: MissingField[] = [];
  if (!state.momentCode) missing.push("moment");
  if (!state.influenceCode) missing.push("influence");
  if (!state.styleCode) missing.push("style");
  if (!state.mode) missing.push("mode");
  if (state.input.trim().length < 2) missing.push("input");
  return missing;
}
