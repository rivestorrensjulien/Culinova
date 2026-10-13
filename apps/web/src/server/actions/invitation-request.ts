"use server";

import { getLocale } from "next-intl/server";
import { z } from "zod";
import { REQUEST_PROFILES, submitInvitationRequest } from "../access/requests";
import { getDb } from "../db";
import { requestMeta } from "../request";

/** Valeurs saisies, renvoyées en cas d'erreur pour ne rien faire retaper. */
export interface RequestValues {
  name: string;
  email: string;
  profile: string;
  message: string;
}

type RequestError = "name" | "email" | "consent" | "rate" | "server";

export type InvitationRequestState =
  | { status: "idle" }
  | { status: "sent" }
  | { status: "error"; error: RequestError; values: RequestValues };

const requestSchema = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.email().max(254),
  profile: z.enum(REQUEST_PROFILES).nullable(),
  message: z.string().trim().max(1000).nullable(),
});

/** Formulaire public de la page d'accueil. */
export async function requestInvitationAction(
  _prev: InvitationRequestState,
  formData: FormData,
): Promise<InvitationRequestState> {
  // Champ piège invisible : seuls les robots le remplissent. On fait comme si tout allait bien.
  if (String(formData.get("website") ?? "") !== "") return { status: "sent" };

  const text = (key: string) => {
    const value = String(formData.get(key) ?? "").trim();
    return value === "" ? null : value;
  };
  const values: RequestValues = {
    name: String(formData.get("name") ?? "").slice(0, 120),
    email: String(formData.get("email") ?? "").slice(0, 254),
    profile: String(formData.get("profile") ?? ""),
    message: String(formData.get("message") ?? "").slice(0, 1000),
  };
  const fail = (error: RequestError): InvitationRequestState => ({ status: "error", error, values });
  const parsed = requestSchema.safeParse({
    name: text("name") ?? "",
    email: text("email") ?? "",
    profile: text("profile"),
    message: text("message"),
  });
  if (!parsed.success) {
    const field = parsed.error.issues[0]?.path[0];
    return fail(field === "name" ? "name" : "email");
  }
  if (formData.get("consent") !== "on") return fail("consent");

  try {
    const locale = (await getLocale()) === "en" ? "en" : "fr";
    const result = await submitInvitationRequest(getDb(), { ...parsed.data, locale }, await requestMeta());
    return result.ok ? { status: "sent" } : fail("rate");
  } catch (error) {
    console.error(
      `Demande d'invitation en échec : ${error instanceof Error ? error.message : String(error)}`,
    );
    return fail("server");
  }
}
