"use server";

import * as s from "@culinova/db/schema";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getLocale } from "next-intl/server";
import { z } from "zod";
import { getDb } from "../db";
import { dispatchGeneration } from "../generation/dispatch";
import { fetchRecipePage, type ImportStart, startImport } from "../generation/import";
import { requireUser } from "../session";

export type ImportActionResult = ImportStart | { ok: false; reason: "url" | "fetch" };

/** Importe une recette depuis un texte collé ou l'adresse d'une page web. */
export async function importRecipeAction(input: { text: string; url: string }): Promise<ImportActionResult> {
  const locale = await getLocale();
  const session = await requireUser(locale);
  let text = String(input.text ?? "").slice(0, 50_000);
  const url = String(input.url ?? "").trim();
  if (url) {
    const page = await fetchRecipePage(url);
    if (!page.ok) return page;
    text = `${page.text}\n${text}`;
  }
  const result = await startImport(getDb(), {
    userId: session.user.id,
    text,
    language: locale === "en" ? "en" : "fr",
  });
  if (result.ok) await dispatchGeneration(result.generationId);
  return result;
}

/** État d'un import : la recette créée, une fois terminé. */
export async function importStatusAction(generationId: string): Promise<{
  status: "queued" | "running" | "succeeded" | "failed" | null;
  recipeId: string | null;
}> {
  const session = await requireUser(await getLocale());
  if (!z.uuid().safeParse(generationId).success) return { status: null, recipeId: null };
  const [row] = await getDb()
    .select({ status: s.aiGenerations.status, recipeId: s.aiGenerations.recipeId })
    .from(s.aiGenerations)
    .where(
      and(
        eq(s.aiGenerations.id, generationId),
        eq(s.aiGenerations.userId, session.user.id),
        eq(s.aiGenerations.kind, "import"),
      ),
    );
  if (row?.status === "succeeded") revalidatePath("/app/recettes", "layout");
  return { status: row?.status ?? null, recipeId: row?.status === "succeeded" ? row.recipeId : null };
}
