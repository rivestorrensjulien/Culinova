import { buttonClasses, Card, CardBody, CardDescription, CardTitle } from "@culinova/ui";
import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";
import { formatDuration } from "@/components/recipe/format";
import { Link } from "@/i18n/navigation";
import { getDb } from "@/server/db";
import { listRecipes } from "@/server/generation/view";
import { requireUser } from "@/server/session";

/** Mes recettes (version simple ; la bibliothèque complète arrive avec recherche et filtres). */
export default async function RecipesPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const session = await requireUser(locale);
  const t = await getTranslations("Recipe");
  const app = await getTranslations("App");
  const format = await getFormatter();
  const recipes = await listRecipes(getDb(), session.user.id);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-4xl">{t("listTitle")}</h1>
        <Link href="/app/creer" className={buttonClasses("primary")}>
          {app("createCta")}
        </Link>
      </div>
      {recipes.length === 0 ? (
        <p className="text-muted">{t("empty")}</p>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {recipes.map((recipe) => (
            <li key={recipe.id}>
              <Link href={`/app/recettes/${recipe.id}`} className="block h-full">
                <Card className="h-full transition-shadow hover:shadow-lifted">
                  <div className="aspect-[16/9] bg-raised" aria-hidden />
                  <CardBody>
                    <CardTitle>{recipe.name}</CardTitle>
                    <CardDescription>
                      {[
                        recipe.cuisineLabel,
                        t("servings", { count: recipe.servings }),
                        formatDuration((recipe.prepS ?? 0) + (recipe.cookS ?? 0)),
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </CardDescription>
                    <p className="mt-2 text-xs text-muted">
                      {t("createdOn", { date: format.dateTime(recipe.updatedAt, { dateStyle: "long" }) })}
                    </p>
                  </CardBody>
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
