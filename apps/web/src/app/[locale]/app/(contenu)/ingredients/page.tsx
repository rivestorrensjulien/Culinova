import { buttonClasses } from "@culinova/ui";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { z } from "zod";
import { Link } from "@/i18n/navigation";
import { listMyIngredients } from "@/server/costing/ingredients";
import { getDb } from "@/server/db";
import { requireUser } from "@/server/session";
import { IngredientsTable } from "./ingredients-table";

// L'estimation des prix par l'IA peut prendre jusqu'à une minute.
export const maxDuration = 120;

/** Mes ingrédients : prix au kilo, au litre ou à la pièce, utilisés pour chiffrer les recettes. */
export default async function IngredientsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ recette?: string }>;
}) {
  const { locale } = await params;
  const { recette } = await searchParams;
  setRequestLocale(locale);
  const session = await requireUser(locale);
  const t = await getTranslations("Ingredients");
  const recipeId = recette && z.uuid().safeParse(recette).success ? recette : undefined;
  const rows = await listMyIngredients(getDb(), session.user.id, { recipeId, languageCode: locale });
  const recipeName = recipeId ? rows.flatMap((r) => r.recipes).find((r) => r.id === recipeId)?.name : null;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="font-display text-4xl">{t("title")}</h1>
          <Link href="/app/ingredients/factures" className={buttonClasses("secondary")}>
            {(await getTranslations("Invoices"))("link")}
          </Link>
        </div>
        <p className="max-w-3xl text-muted">{t("intro")}</p>
        {recipeId ? (
          <p className="text-sm">
            {t("filteredBy", { name: recipeName ?? "" })}{" "}
            <Link href="/app/ingredients" className="font-medium text-primary hover:underline">
              {t("showAll")}
            </Link>
            {" · "}
            <Link href={`/app/recettes/${recipeId}`} className="font-medium text-primary hover:underline">
              {t("backToRecipe")}
            </Link>
          </p>
        ) : null}
      </div>
      {rows.length === 0 ? <p className="text-muted">{t("empty")}</p> : <IngredientsTable rows={rows} />}
    </div>
  );
}
