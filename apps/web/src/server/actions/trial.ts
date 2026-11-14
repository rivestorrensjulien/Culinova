"use server";

import { getLocale } from "next-intl/server";
import { z } from "zod";
import { redirect } from "@/i18n/navigation";
import { getDb } from "../db";
import { dispatchGeneration } from "../generation/dispatch";
import { requestMeta } from "../request";
import { startTrial } from "../trials";

export type TrialFormError = "input" | "closed" | "rate" | "full" | "budget" | "server";
export type TrialFormState = { status: "idle" } | { status: "error"; error: TrialFormError; input: string };

const trialSchema = z.object({
  mode: z.enum(["ingredients", "idea"]),
  input: z.string().trim().min(2).max(300),
  moment: z.string().min(1).max(40),
  servings: z.coerce.number().int().min(1).max(12),
  minutes: z.union([z.literal(""), z.coerce.number().int().min(5).max(600)]),
});

/** Provenance gardée d'une page à l'autre (jamais prise telle quelle : relue par visitSource). */
const QUERY_KEYS = ["utm_source", "utm_medium", "utm_campaign", "recette", "de"];

/** Recette d'essai sans compte, depuis /essai. */
export async function startTrialAction(_prev: TrialFormState, formData: FormData): Promise<TrialFormState> {
  const input = String(formData.get("input") ?? "").slice(0, 300);
  // Champ piège invisible : seuls les robots le remplissent.
  if (String(formData.get("website") ?? "") !== "") return { status: "error", error: "server", input };
  const parsed = trialSchema.safeParse({
    mode: formData.get("mode"),
    input,
    moment: formData.get("moment"),
    servings: formData.get("servings"),
    minutes: String(formData.get("minutes") ?? ""),
  });
  if (!parsed.success) return { status: "error", error: "input", input };

  const query: Record<string, string> = {};
  const incoming = new URLSearchParams(String(formData.get("query") ?? "").slice(0, 500));
  for (const key of QUERY_KEYS) {
    const value = incoming.get(key);
    if (value && /^[\w.-]{1,120}$/.test(value)) query[key] = value;
  }

  const locale = (await getLocale()) === "en" ? "en" : "fr";
  let token: string;
  try {
    const result = await startTrial(
      getDb(),
      {
        mode: parsed.data.mode,
        input: parsed.data.input,
        momentCode: parsed.data.moment,
        servings: parsed.data.servings,
        maxMinutes: parsed.data.minutes === "" ? null : parsed.data.minutes,
        language: locale,
        sourceRecipe: query.recette ?? null,
      },
      await requestMeta(),
    );
    if (!result.ok) {
      const error: TrialFormError =
        result.reason === "invalid" ? "input" : result.reason === "rate_limited" ? "rate" : result.reason;
      return { status: "error", error, input };
    }
    await dispatchGeneration(result.generationId);
    token = result.token;
  } catch (error) {
    console.error(`Essai en échec : ${error instanceof Error ? error.message : String(error)}`);
    return { status: "error", error: "server", input };
  }
  return redirect({ href: { pathname: `/essai/${token}`, query }, locale });
}
