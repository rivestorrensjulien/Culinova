import { headers } from "next/headers";
import { readSource, type RequestSource } from "@/lib/request-source";
import { appUrl } from "./auth";

/** Adresse IP et navigateur de la requête en cours (pour l'audit et les consentements). */
export async function requestMeta(): Promise<{ ip: string | null; userAgent: string | null }> {
  const h = await headers();
  const forwarded = h.get("x-forwarded-for")?.split(",")[0]?.trim();
  return { ip: forwarded || h.get("x-real-ip") || null, userAgent: h.get("user-agent") };
}

/** Provenance de la visite en cours (adresse, sinon site précédent) ; Culinova lui-même est ignoré. */
export async function visitSource(
  params: Record<string, string | string[] | undefined>,
): Promise<RequestSource> {
  const h = await headers();
  return readSource(params, h.get("referer"), [new URL(appUrl()).hostname, "culinova.fr"]);
}
