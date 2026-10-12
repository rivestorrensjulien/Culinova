"use server";

import { users } from "@culinova/db/schema";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { getLocale } from "next-intl/server";
import { z } from "zod";
import { redirect } from "@/i18n/navigation";
import { deleteAccount } from "../account";
import { audit } from "../audit";
import { getDb } from "../db";
import { createImageStorage, type ImageStorage } from "../images/storage";
import { requestMeta } from "../request";
import { requireUser } from "../session";

export type AccountFormState =
  | { status: "idle" }
  | { status: "saved" }
  | { status: "error"; code: "name" | "mismatch" | "last_admin" | "impersonating" | "failed" };

const nameSchema = z.string().trim().max(80);

export async function updateProfileAction(
  _prev: AccountFormState,
  formData: FormData,
): Promise<AccountFormState> {
  const session = await requireUser(await getLocale());
  const parsed = nameSchema.safeParse(formData.get("name") ?? "");
  if (!parsed.success) return { status: "error", code: "name" };
  const db = getDb();
  await db.update(users).set({ name: parsed.data }).where(eq(users.id, session.user.id));
  await audit(db, {
    actorId: session.impersonatedBy ?? session.user.id,
    impersonatorId: session.impersonatedBy,
    action: "account.profile.update",
    entity: "user",
    entityId: session.user.id,
    after: { name: parsed.data },
  });
  revalidatePath("/", "layout");
  return { status: "saved" };
}

function storageOrNull(): ImageStorage | null {
  try {
    return createImageStorage();
  } catch {
    return null;
  }
}

/** Suppression définitive : la personne confirme en saisissant son adresse e-mail. */
export async function deleteAccountAction(
  _prev: AccountFormState,
  formData: FormData,
): Promise<AccountFormState> {
  const locale = await getLocale();
  const session = await requireUser(locale);
  if (session.impersonatedBy) return { status: "error", code: "impersonating" };
  const typed = String(formData.get("confirm") ?? "")
    .trim()
    .toLowerCase();
  if (typed !== session.user.email.toLowerCase()) return { status: "error", code: "mismatch" };

  const result = await deleteAccount(getDb(), session.user.id, {
    ...(await requestMeta()),
    storage: storageOrNull(),
  }).catch((error: unknown) => {
    console.error("Suppression du compte impossible", error);
    return null;
  });
  if (!result) return { status: "error", code: "failed" };
  if (!result.ok) return { status: "error", code: result.reason === "last_admin" ? "last_admin" : "failed" };

  // Les sessions ont disparu avec le compte : on efface aussi les cookies du navigateur.
  const jar = await cookies();
  for (const cookie of jar.getAll()) {
    if (cookie.name.includes("culinova.")) jar.delete(cookie.name);
  }
  return redirect({ href: "/connexion?raison=supprime", locale });
}
