import { buttonClasses } from "@culinova/ui";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { getDb } from "@/server/db";
import { listLibrary } from "@/server/library";
import { requireUser } from "@/server/session";
import { Library } from "./library";

/** Mes recettes : bibliothèque avec recherche, filtres et favoris. */
export default async function RecipesPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const session = await requireUser(locale);
  const t = await getTranslations("Recipe");
  const app = await getTranslations("App");
  const cards = await listLibrary(getDb(), session.user.id, locale);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-4xl">{t("listTitle")}</h1>
        <Link href="/app/creer" className={buttonClasses("primary")}>
          {app("createCta")}
        </Link>
      </div>
      {cards.length === 0 ? <p className="text-muted">{t("empty")}</p> : <Library cards={cards} />}
    </div>
  );
}
