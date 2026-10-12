import type { ReactNode } from "react";
import { getLocale } from "next-intl/server";
import { ConsentUpdate } from "@/components/legal/consent-update";
import { getDb } from "@/server/db";
import { pendingConsents } from "@/server/legal";
import { requireUser } from "@/server/session";

/**
 * Pages de travail : tant que les nouvelles versions des CGU ou de la politique de
 * confidentialité ne sont pas acceptées, elles laissent place à l'écran d'acceptation.
 * « Mon compte » (export, suppression) reste accessible.
 */
export default async function ContentLayout({ children }: { children: ReactNode }) {
  const session = await requireUser(await getLocale());
  // Un administrateur « en tant que » n'accepte jamais à la place de la personne.
  const pending = session.impersonatedBy ? [] : await pendingConsents(getDb(), session.user.id);
  return pending.length > 0 ? <ConsentUpdate documents={pending} /> : children;
}
