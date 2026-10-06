import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { z } from "zod";
import { Link } from "@/i18n/navigation";
import { getDb } from "@/server/db";
import { loadRecipeView } from "@/server/generation/view";
import { requireUser } from "@/server/session";
import { RecipePageClient } from "./recipe-page-client";

// Sans Inngest, la génération lancée depuis cette page s'exécute après la réponse :
// on lui laisse jusqu'à 5 minutes (limite de Vercel).
export const maxDuration = 300;

export default async function RecipePage({ params }: { params: Promise<{ locale: string; id: string }> }) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const session = await requireUser(locale);
  if (!z.uuid().safeParse(id).success) notFound();
  const recipe = await loadRecipeView(getDb(), id, session.user.id);
  if (!recipe) notFound();
  const t = await getTranslations("Recipe");
  return (
    <div className="flex flex-col gap-6">
      <Link href="/app/recettes" className="text-sm text-primary hover:underline">
        ← {t("back")}
      </Link>
      <RecipePageClient initial={recipe} />
    </div>
  );
}
