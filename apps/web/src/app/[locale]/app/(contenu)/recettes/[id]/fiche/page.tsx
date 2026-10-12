import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { z } from "zod";
import { TechnicalSheet } from "@/components/recipe/technical-sheet";
import { getDb } from "@/server/db";
import { loadRecipeView } from "@/server/generation/view";
import { requireUser } from "@/server/session";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  return { title: (await getTranslations({ locale, namespace: "Sheet" }))("title") };
}

/** Fiche technique imprimable (ou enregistrable en PDF) de la version active. */
export default async function TechnicalSheetPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const session = await requireUser(locale);
  if (!z.uuid().safeParse(id).success) notFound();
  const recipe = await loadRecipeView(getDb(), id, session.user.id);
  if (!recipe) notFound();
  const photo = recipe.images.current;
  const photoId = photo?.formats.find((f) => f.format === "1:1")?.id ?? photo?.id ?? null;
  return <TechnicalSheet recipe={recipe} photoId={photoId} />;
}
