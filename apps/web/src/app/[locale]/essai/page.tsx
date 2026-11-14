/**
 * Recette d'essai sans compte (P7) : la porte d'entrée depuis les pages publiques.
 * Une première recette, pesée au gramme, avant même de demander une invitation.
 */
import { buttonClasses, Card, CardBody, Notice } from "@culinova/ui";
import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { TrialForm } from "@/components/trial/trial-form";
import { Link } from "@/i18n/navigation";
import { sourceQuery } from "@/lib/request-source";
import { getDb } from "@/server/db";
import { loadCulinaryReference } from "@/server/generation/reference";
import { visitSource } from "@/server/request";
import { getTrialSettings } from "@/server/trials";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Trial" });
  return { title: t("metaTitle"), description: t("intro") };
}

export default async function TrialPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("Trial");
  const db = getDb();
  const [settings, reference, source] = await Promise.all([
    getTrialSettings(db),
    loadCulinaryReference(db, locale === "en" ? "en" : "fr"),
    visitSource(await searchParams),
  ]);
  const query = sourceQuery(source);

  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader />
      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-8 px-4 py-10 sm:px-8 sm:py-14">
        <div className="flex flex-col gap-3">
          <p className="text-xs font-medium tracking-[0.25em] text-primary uppercase">{t("kicker")}</p>
          <h1 className="font-display text-4xl leading-tight text-balance sm:text-5xl">{t("title")}</h1>
          <p className="text-lg text-muted">{t("intro")}</p>
        </div>
        <Card>
          <CardBody>
            {settings.enabled ? (
              <TrialForm moments={reference.moments} query={new URLSearchParams(query).toString()} />
            ) : (
              <div className="flex flex-col gap-4">
                <Notice tone="info">{t("closed")}</Notice>
                <Link
                  href={{ pathname: "/", query, hash: "invitation" }}
                  className={buttonClasses("primary", "lg")}
                >
                  {t("requestButton")}
                </Link>
              </div>
            )}
          </CardBody>
        </Card>
        <ul className="grid grid-cols-1 gap-3 text-sm text-muted sm:grid-cols-3">
          {(["weighed", "steps", "tips"] as const).map((key) => (
            <li key={key} className="rounded-2xl bg-soft px-4 py-3">
              {t(`promises.${key}`)}
            </li>
          ))}
        </ul>
      </main>
      <SiteFooter />
    </div>
  );
}
