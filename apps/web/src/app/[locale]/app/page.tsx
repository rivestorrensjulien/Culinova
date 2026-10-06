import { Card, CardBody, CardTitle, Notice, Progress } from "@culinova/ui";
import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";
import { getDb } from "@/server/db";
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
  const format = await getFormatter();
  const usage = await getMonthlyUsage(getDb(), session.user.id);
  const reset = new Date(Date.UTC(usage.resetsOn.year, usage.resetsOn.month - 1, usage.resetsOn.day, 12));

  const meters = [
    { key: "recipes" as const, label: t("recipes") },
    { key: "images" as const, label: t("images") },
  ];

  return (
    <div className="flex flex-col gap-8">
      {bienvenue ? <Notice tone="success">{t("welcome")}</Notice> : null}
      <h1 className="font-display text-4xl">
        {session.user.name ? t("hello", { name: session.user.name }) : t("helloAnonymous")}
      </h1>

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
          {t("resets", {
            // Le 1er du mois : « 1er novembre 2026 » en français, « November 1, 2026 » en anglais.
            date:
              locale === "fr"
                ? `1er ${format.dateTime(reset, { month: "long", year: "numeric" })}`
                : format.dateTime(reset, { day: "numeric", month: "long", year: "numeric" }),
          })}{" "}
          {usage.limits.regenerations !== null
            ? t("regenerations", { count: usage.limits.regenerations })
            : null}
        </p>
      </section>

      <Notice>{t("comingSoon")}</Notice>
    </div>
  );
}
