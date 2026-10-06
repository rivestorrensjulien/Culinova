/** Transforme l'état du wizard en paramètres complets pour le moteur de recette. */
import type { RecipeRequest } from "@culinova/ai";
import type { WizardState } from "@/lib/wizard";
import type { CulinaryReference } from "./reference";

export class InvalidWizardStateError extends Error {}

export function buildRecipeRequest(
  state: WizardState,
  reference: CulinaryReference,
  profile: { diets: string[]; allergens: string[]; dislikedIngredients: string[] } = {
    diets: [],
    allergens: [],
    dislikedIngredients: [],
  },
): RecipeRequest {
  const moment = reference.moments.find((m) => m.code === state.momentCode);
  const style = reference.styles.find((st) => st.code === state.styleCode);
  if (!moment || !style || !state.mode || state.input.trim().length < 2) {
    throw new InvalidWizardStateError("Paramètres incomplets");
  }
  const influence =
    state.influenceCode && state.influenceCode !== "none"
      ? reference.influences.find((i) => i.code === state.influenceCode)
      : undefined;
  const region = reference.regions.find((r) => r.code === state.regionCode);
  const country = reference.countries.find((c) => c.iso === state.countryIso);
  const regionLabel = (code: string | null) => reference.regions.find((r) => r.code === code)?.label ?? null;
  const countryLabel = (iso: string | null) => reference.countries.find((c) => c.iso === iso)?.label ?? null;
  const cuisines = state.cuisineCodes
    .map((code) => reference.cuisines.find((c) => c.code === code))
    .filter((c): c is NonNullable<typeof c> => Boolean(c))
    .map((c) => ({
      label: c.label,
      country: countryLabel(c.countryIso),
      region: regionLabel(c.regionCode),
      description: c.description,
      signatureIngredients: c.signatureIngredients,
      techniques: c.techniques,
      spices: c.spices,
      referenceDishes: c.referenceDishes,
    }));

  return {
    moment: moment.label,
    influence: influence?.label ?? null,
    region: region?.label ?? null,
    country: country?.label ?? null,
    cuisines,
    style: { code: style.code, label: style.label, description: style.description },
    language: state.language,
    mode: state.mode,
    input: state.input,
    servings: state.servings,
    constraints: profile,
  };
}
