import { buttonClasses, Card, CardBody, CardTitle, Notice, Progress } from "@culinova/ui";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { formatResetDate } from "@/lib/dates";
import { getDb } from "@/server/db";
import { listRecipes } from "@/server/generation/view";
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
  const [usage, recipes] = await Promise.all([
    getMonthlyUsage(getDb(), session.user.id),
    listRecipes(getDb(), session.user.id),
  ]);

  const meters = [
    { key: "recipes" as const, label: t("recipes") },
    { key: "images" as const, label: t("images") },
  ];

  return (
    <div className="flex flex-col gap-8">
      {bienvenue ? <Notice tone="success">{t("welcome")}</Notice> : null}
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
        <div className="grid gap-4 sm:grid-cols-2">
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
    </div>
  );
}
