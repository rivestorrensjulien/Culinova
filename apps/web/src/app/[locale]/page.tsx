import { buttonClasses } from "@culinova/ui";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { Link } from "@/i18n/navigation";

/** Page d'accueil provisoire (la vraie page d'accueil arrive au jalon J8). */
export default async function HomePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("Home");
  const common = await getTranslations("Common");
  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader />
      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col items-start justify-center gap-6 px-6 py-16">
        <p className="text-xs font-medium tracking-[0.3em] text-primary uppercase">{common("brand")}</p>
        <h1 className="font-display text-5xl leading-[1.05] text-balance sm:text-6xl">{common("tagline")}</h1>
        <p className="max-w-xl text-lg text-muted">{t("intro")}</p>
        <div className="flex flex-wrap gap-3">
          <Link href="/connexion" className={buttonClasses("primary", "lg")}>
            {t("signIn")}
          </Link>
          <Link href="/invitation" className={buttonClasses("secondary", "lg")}>
            {t("haveCode")}
          </Link>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
