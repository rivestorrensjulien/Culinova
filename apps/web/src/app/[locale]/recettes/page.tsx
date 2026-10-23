/**
 * Page « lien en bio » (culinova.fr/recettes) : les recettes partagées sur les réseaux, de la
 * plus récente à la plus ancienne. C'est le lien cliquable d'Instagram et de TikTok.
 */
import { buttonClasses } from "@culinova/ui";
import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { MobileCta } from "@/components/home/mobile-cta";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { Link } from "@/i18n/navigation";
import { getDb } from "@/server/db";
import { listPublicRecipes, PUBLIC_RECIPE_PATH } from "@/server/public-recipes";

export const dynamic = "force-dynamic";

const SOCIAL = [
  { label: "Instagram", href: "https://www.instagram.com/culinova.recette/" },
  { label: "TikTok", href: "https://www.tiktok.com/@culinova.recette" },
  { label: "Pinterest", href: "https://fr.pinterest.com/CulinovaRecette/" },
] as const;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "PublicRecipe" });
  return { title: t("listTitle"), description: t("listIntro") };
}

export default async function PublicRecipesPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("PublicRecipe");
  const recipes = await listPublicRecipes(getDb());

  return (
    <div className="flex min-h-dvh flex-col pb-20 md:pb-0">
      <SiteHeader>
        <a href="#invitation" className={buttonClasses("primary", "sm")}>
          {t("topCta")}
        </a>
      </SiteHeader>
      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-10 px-4 py-10 sm:px-8 sm:py-14">
        <header className="flex flex-col items-center gap-4 text-center">
          {/* eslint-disable-next-line @next/next/no-img-element -- illustration statique */}
          <img
            src="/mascotte-3d.png"
            alt={t("mascotAlt")}
            className="size-28 rounded-full bg-primary object-cover object-top shadow-lg"
          />
          <h1 className="font-display text-4xl sm:text-5xl">{t("listTitle")}</h1>
          <p className="max-w-xl text-lg text-muted">{t("listIntro")}</p>
          <nav className="flex flex-wrap justify-center gap-2" aria-label={t("follow")}>
            {SOCIAL.map((s) => (
              <a
                key={s.href}
                href={s.href}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-full border border-border px-4 py-1.5 text-sm hover:border-primary hover:text-primary"
              >
                {s.label}
              </a>
            ))}
          </nav>
        </header>

        {recipes.length === 0 ? (
          <p className="text-center text-muted">{t("listEmpty")}</p>
        ) : (
          <ul className="grid grid-cols-2 gap-4 sm:gap-6 md:grid-cols-3" data-testid="public-list">
            {recipes.map((recipe) => (
              <li key={recipe.slug}>
                <Link
                  href={`${PUBLIC_RECIPE_PATH}/${recipe.slug}`}
                  className="group flex flex-col gap-3 rounded-3xl focus-visible:outline-2 focus-visible:outline-primary"
                >
                  {recipe.imageId ? (
                    // eslint-disable-next-line @next/next/no-img-element -- photo servie par l'API, déjà recadrée
                    <img
                      src={`/api/vitrine/${recipe.imageId}`}
                      alt={recipe.name}
                      loading="lazy"
                      className="aspect-[4/5] w-full rounded-3xl object-cover shadow-md transition group-hover:shadow-xl"
                    />
                  ) : (
                    <div className="aspect-[4/5] w-full rounded-3xl bg-soft" />
                  )}
                  <span className="font-display text-lg leading-snug group-hover:text-primary">
                    {recipe.name}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}

        <section
          id="invitation"
          className="scroll-mt-8 flex flex-col items-center gap-4 rounded-[2rem] bg-primary p-8 text-center text-primary-foreground sm:p-12"
        >
          <h2 className="font-display text-3xl text-balance sm:text-4xl">{t("ctaTitle")}</h2>
          <p className="max-w-xl text-lg opacity-90">{t("ctaText")}</p>
          <Link
            href="/#invitation"
            className="inline-flex items-center rounded-full bg-background px-6 py-3 font-medium text-foreground shadow-sm transition hover:opacity-90"
          >
            {t("ctaButton")}
          </Link>
        </section>
      </main>
      <MobileCta label={t("topCta")} />
      <SiteFooter />
    </div>
  );
}
