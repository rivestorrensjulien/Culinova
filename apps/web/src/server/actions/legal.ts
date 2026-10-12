"use server";

import { revalidatePath } from "next/cache";
import { getLocale } from "next-intl/server";
import { z } from "zod";
import { getDb } from "../db";
import { acceptDocuments } from "../legal";
import { requestMeta } from "../request";
import { requireUser } from "../session";

/** Acceptation des nouvelles versions des CGU et de la politique de confidentialité. */
export async function acceptConsentsAction(formData: FormData): Promise<void> {
  const session = await requireUser(await getLocale());
  if (session.impersonatedBy) return;
  if (formData.get("accept") !== "on") return;
  const ids = z.array(z.uuid()).max(10).parse(formData.getAll("document"));
  await acceptDocuments(getDb(), session.user.id, ids, await requestMeta());
  revalidatePath("/", "layout");
}
