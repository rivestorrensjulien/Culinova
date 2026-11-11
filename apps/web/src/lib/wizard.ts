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
/**
 * Parcours court des particuliers (décision de Julien du 11/11) : ce qu'on cuisine (frigo ou
 * idée), puis personnes, budget et temps, puis niveau et matériel. Influence « aucune » et style
 * « traditionnel » sont choisis d'office ; pas d'étape « réseaux sociaux ».
 */
export const HOME_WIZARD_STEPS = ["wish", "practical", "kitchen", "generation", "result", "saved"] as const;

export type WizardStepKey = (typeof WIZARD_STEPS)[number] | (typeof HOME_WIZARD_STEPS)[number];

/** Étapes du parcours selon le mode du compte. */
export function wizardSteps(proMode: boolean): readonly WizardStepKey[] {
  return proMode ? WIZARD_STEPS : HOME_WIZARD_STEPS;
}

/** Appareils proposés (plaques et four cochés par défaut). */
export const KITCHEN_EQUIPMENT = [
  "hob",
  "oven",
  "microwave",
  "air_fryer",
  "multicooker",
  "blender",
  "stand_mixer",
] as const;
export type KitchenEquipment = (typeof KITCHEN_EQUIPMENT)[number];
export const DEFAULT_EQUIPMENT: KitchenEquipment[] = ["hob", "oven"];
export const COOKING_LEVELS = ["beginner", "comfortable", "confident"] as const;
export type CookingLevel = (typeof COOKING_LEVELS)[number];
/** Budgets proposés par personne, en centimes. */
export const BUDGET_PRESETS_CENTS = [200, 300, 500, 800] as const;
/** Temps disponibles proposés, en minutes. */
export const TIME_PRESETS_MINUTES = [15, 30, 45, 60] as const;

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
  /** Budget par personne en centimes (null = sans limite). */
  budgetPerServingCents: z.number().int().min(50).max(10_000).nullable().catch(null),
  /** Temps disponible (préparation + cuisson) en minutes (null = pas pressé). */
  maxMinutes: z.number().int().min(5).max(600).nullable().catch(null),
  level: z.enum(COOKING_LEVELS).nullable().catch(null),
  /** Appareils disponibles (null = pas demandé : parcours pro). */
  equipment: z.array(z.enum(KITCHEN_EQUIPMENT)).max(KITCHEN_EQUIPMENT.length).nullable().catch(null),
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
    budgetPerServingCents: null,
    maxMinutes: null,
    level: null,
    equipment: null,
  };
}

/**
 * Choix faits d'office pour le parcours court : aucune influence, style traditionnel, plaques et
 * four. N'écrase jamais un choix déjà fait.
 */
export function withHomeDefaults(state: WizardState): WizardState {
  return {
    ...state,
    influenceCode: state.influenceCode ?? "none",
    styleCode: state.styleCode ?? "traditional",
    mode: state.mode === "name" ? "idea" : state.mode,
    equipment: state.equipment ?? DEFAULT_EQUIPMENT,
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
