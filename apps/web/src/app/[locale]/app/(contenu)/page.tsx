import { buttonClasses, Card, CardBody, CardTitle, Notice, Progress } from "@culinova/ui";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { InstallPrompt } from "@/components/pwa/install-prompt";
import { Link } from "@/i18n/navigation";
import { formatResetDate } from "@/lib/dates";
import { getDb } from "@/server/db";
import { listRecipes } from "@/server/generation/view";
import { listPublicRecipes } from "@/server/public-recipes";
import { getMonthlyUsage } from "@/server/quotas";
import { requireUser } from "@/server/session";

export default async function DashboardPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ bienvenue?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const session = await requireUser(locale);
  const { bienvenue } = await searchParams;
  const t = await getTranslations("App");
  const [usage, recipes, selection] = await Promise.all([
    getMonthlyUsage(getDb(), session.user.id),
    listRecipes(getDb(), session.user.id),
    // La sélection de Chef Ju : recettes relues, visibles par tous (pages publiques).
    listPublicRecipes(getDb(), 6, { chefReviewedOnly: true }),
  ]);

  const meters = [
    { key: "recipes" as const, label: t("recipes") },
    { key: "images" as const, label: t("images") },
  ];

  return (
    <div className="flex flex-col gap-8">
      {bienvenue ? <Notice tone="success">{t("welcome")}</Notice> : null}
      <InstallPrompt />
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="font-display text-4xl">
          {session.user.name ? t("hello", { name: session.user.name }) : t("helloAnonymous")}
        </h1>
        <Link href="/app/creer" className={buttonClasses("primary", "lg")}>
          {t("createCta")}
        </Link>
      </div>

      <section className="flex flex-col gap-4">
        <h2 className="font-display text-2xl">{t("quotaTitle")}</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {meters.map(({ key, label }) => {
            const used = usage.used[key];
            const limit = usage.limits[key];
            return (
              <Card key={key}>
                <CardBody className="flex flex-col gap-3">
                  <div className="flex items-baseline justify-between gap-3">
                    <CardTitle className="text-lg">{label}</CardTitle>
                    <span className="text-sm text-muted" data-testid={`quota-${key}`}>
                      {limit === null ? t("usageUnlimited", { used }) : t("usage", { used, limit })}
                    </span>
                  </div>
                  <Progress value={used} max={limit} label={label} />
                </CardBody>
              </Card>
            );
          })}
        </div>
        <p className="text-sm text-muted">
          {t("resets", { date: formatResetDate(usage.resetsOn, locale) })}{" "}
          {usage.limits.regenerations !== null
            ? t("regenerations", { count: usage.limits.regenerations })
            : null}
        </p>
      </section>

      {recipes.length > 0 ? (
        <section className="flex flex-col gap-3">
          <h2 className="font-display text-2xl">{t("recentRecipes")}</h2>
          <ul className="flex flex-col divide-y divide-border rounded-lg border border-border bg-surface">
            {recipes.slice(0, 5).map((recipe) => (
              <li key={recipe.id}>
                <Link
                  href={`/app/recettes/${recipe.id}`}
                  className="flex justify-between gap-3 px-4 py-3 hover:bg-raised"
                >
                  <span className="font-medium">{recipe.name}</span>
                  <span className="text-sm text-muted">{recipe.cuisineLabel}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {selection.length > 0 ? (
        <section className="flex flex-col gap-3" data-testid="chef-selection">
          <div>
            <h2 className="font-display text-2xl">{t("selectionTitle")}</h2>
            <p className="text-muted">{t("selectionText")}</p>
          </div>
          <ul className="-mx-4 flex gap-4 overflow-x-auto px-4 pb-2 sm:mx-0 sm:grid sm:grid-cols-3 sm:overflow-visible sm:px-0">
            {selection.map((recipe) => (
              <li key={recipe.slug} className="w-40 shrink-0 sm:w-auto">
                <a
                  href={`/recette/${recipe.slug}`}
                  target="_blank"
                  rel="noopener"
                  className="group flex flex-col gap-2"
                >
                  {recipe.imageId ? (
                    // eslint-disable-next-line @next/next/no-img-element -- photo servie par l'API, déjà recadrée
                    <img
                      src={`/api/vitrine/${recipe.imageId}`}
                      alt={recipe.name}
                      loading="lazy"
                      className="aspect-[4/5] w-full rounded-2xl object-cover shadow-sm transition group-hover:shadow-lg"
                    />
                  ) : (
                    <div className="aspect-[4/5] w-full rounded-2xl bg-soft" />
                  )}
                  <span className="text-sm font-medium leading-snug group-hover:text-primary">
                    {recipe.name}
                  </span>
                </a>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
