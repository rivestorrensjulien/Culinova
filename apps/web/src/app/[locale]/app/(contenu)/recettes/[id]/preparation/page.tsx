import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { z } from "zod";
import { CookingMode } from "@/components/recipe/cooking-mode";
import { getDb } from "@/server/db";
import { loadRecipeView } from "@/server/generation/view";
import { requireUser } from "@/server/session";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  return { title: (await getTranslations({ locale, namespace: "Prep" }))("title") };
}

/** Mode préparation de la version active : étape par étape, en plein écran. */
export default async function CookingModePage({
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
  return <CookingMode recipe={recipe} />;
}
