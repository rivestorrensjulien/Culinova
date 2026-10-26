/**
 * Page publique d'une recette (liens des réseaux sociaux) : de son nom jusqu'aux conseils,
 * puis une invitation à créer ses propres recettes sur Culinova. Jamais de coût, de prix de
 * vente, de marge ni de nutrition : la page ne reçoit que `PublicRecipe`.
 */
import { Badge, buttonClasses, Card, CardBody } from "@culinova/ui";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { MobileCta } from "@/components/home/mobile-cta";
import { formatDuration } from "@/components/recipe/format";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { Link } from "@/i18n/navigation";
import { sourceQuery, withRecipe } from "@/lib/request-source";
import { appUrl } from "@/server/auth";
import { getDb } from "@/server/db";
import { loadPublicRecipe, PUBLIC_LIST_PATH } from "@/server/public-recipes";
import { visitSource } from "@/server/request";

export const dynamic = "force-dynamic";

const photoUrl = (id: string) => `/api/vitrine/${id}`;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}): Promise<Metadata> {
  const { locale, slug } = await params;
  const recipe = await loadPublicRecipe(getDb(), slug);
  if (!recipe) return {};
  const t = await getTranslations({ locale, namespace: "PublicRecipe" });
  const image = recipe.photo.portrait ?? recipe.photo.landscape;
  const description = recipe.description ?? t("metaDescription");
  return {
    title: t("metaTitle", { name: recipe.name }),
    description,
    openGraph: {
      title: recipe.name,
      description,
      type: "article",
      url: `${appUrl()}/recette/${recipe.slug}`,
      siteName: "Culinova",
      ...(image ? { images: [{ url: `${appUrl()}${photoUrl(image)}`, width: 1080, height: 1350 }] } : {}),
    },
    twitter: { card: "summary_large_image", title: recipe.name, description },
  };
}

export default async function PublicRecipePage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale, slug } = await params;
  setRequestLocale(locale);
  const recipe = await loadPublicRecipe(getDb(), slug);
  if (!recipe) notFound();
  // Provenance (réseau, message « RECETTE »…) et recette d'origine, jusqu'au formulaire.
  const query = sourceQuery(withRecipe(await visitSource(await searchParams), recipe.slug));
  const t = await getTranslations("PublicRecipe");
  const tr = await getTranslations("Recipe");
  const total = recipe.prepS + recipe.cookS + recipe.restS;
  const times = [
    [tr("prep"), recipe.prepS],
    [tr("cook"), recipe.cookS],
    [tr("rest"), recipe.restS],
  ] as const;
  const photo = recipe.photo.portrait ?? recipe.photo.landscape;

  return (
    <div className="flex min-h-dvh flex-col pb-20 md:pb-0">
      <SiteHeader>
        <a href="#invitation" className={buttonClasses("primary", "sm")} data-testid="public-top-cta">
          {t("topCta")}
        </a>
      </SiteHeader>

      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-12 px-4 py-10 sm:px-8 sm:py-14">
        <article className="flex flex-col gap-12" data-testid="public-recipe">
          <header className="grid items-center gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] lg:gap-14">
            {photo ? (
              // eslint-disable-next-line @next/next/no-img-element -- photo servie par l'API, déjà recadrée
              <img
                src={photoUrl(photo)}
                alt={recipe.name}
                className="aspect-[4/5] w-full rounded-[2rem] object-cover shadow-xl"
              />
            ) : null}
            <div className="flex flex-col gap-5">
              <p className="text-xs font-medium tracking-[0.25em] text-primary uppercase">{t("by")}</p>
              <h1 className="font-display text-4xl leading-tight text-balance sm:text-5xl">{recipe.name}</h1>
              {recipe.description ? <p className="text-lg text-muted">{recipe.description}</p> : null}
              <div className="flex flex-wrap gap-2">
                {recipe.cuisineLabel ? <Badge tone="accent">{recipe.cuisineLabel}</Badge> : null}
                {recipe.difficulty ? <Badge>{tr(`difficulty.${recipe.difficulty}`)}</Badge> : null}
                {recipe.diets.map((d) => (
                  <Badge key={d} tone="sage">
                    {tr.has(`dietNames.${d}`) ? tr(`dietNames.${d}`) : d}
                  </Badge>
                ))}
              </div>
              <dl className="grid grid-cols-[repeat(auto-fit,minmax(6.5rem,1fr))] gap-3">
                <div className="rounded-2xl bg-soft px-4 py-3">
                  <dt className="text-xs text-muted">{t("for")}</dt>
                  <dd className="font-display text-lg whitespace-nowrap">
                    {tr("servings", { count: recipe.servings })}
                  </dd>
                </div>
                {times
                  .filter(([, value]) => value > 0)
                  .map(([label, value]) => (
                    <div key={label} className="rounded-2xl bg-soft px-4 py-3">
                      <dt className="text-xs text-muted">{label}</dt>
                      <dd className="font-display text-lg whitespace-nowrap">{formatDuration(value)}</dd>
                    </div>
                  ))}
                {total > 0 ? (
                  <div className="rounded-2xl bg-soft px-4 py-3">
                    <dt className="text-xs text-muted">{tr("total")}</dt>
                    <dd className="font-display text-lg whitespace-nowrap">{formatDuration(total)}</dd>
                  </div>
                ) : null}
              </dl>
              <p className="text-sm text-muted">{t("weighed")}</p>
            </div>
          </header>

          <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)] lg:gap-12">
            <div>
              <Card className="lg:sticky lg:top-6">
                <CardBody className="flex flex-col gap-4">
                  <h2 className="font-display text-2xl">{tr("ingredientsTitle")}</h2>
                  <ul className="flex flex-col divide-y divide-border" data-testid="public-ingredients">
                    {recipe.ingredients.map((ingredient) => (
                      <li
                        key={`${ingredient.label}-${ingredient.amount}`}
                        className="flex items-baseline justify-between gap-4 py-2.5"
                      >
                        <span>
                          {ingredient.label}
                          {ingredient.homemade ? (
                            <span className="text-sm text-muted"> · {t("homemade")}</span>
                          ) : null}
                        </span>
                        <span className="shrink-0 text-right font-medium text-primary">
                          {ingredient.amount}
                        </span>
                      </li>
                    ))}
                  </ul>
                </CardBody>
              </Card>
            </div>

            <div className="flex flex-col gap-10">
              <section className="flex flex-col gap-5">
                <h2 className="font-display text-3xl">{tr("stepsTitle")}</h2>
                <ol className="flex flex-col gap-5" data-testid="public-steps">
                  {recipe.steps.map((step, index) => (
                    <li key={index} className="flex gap-4">
                      <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary font-display text-lg text-primary-foreground">
                        {index + 1}
                      </span>
                      <div className="flex flex-col gap-1.5 pt-1.5">
                        <p className="text-lg leading-relaxed">{step.text}</p>
                        {step.expected ? (
                          <p className="text-sm text-muted">
                            {tr("expected")} : {step.expected}
                          </p>
                        ) : null}
                      </div>
                    </li>
                  ))}
                </ol>
              </section>

              {recipe.plating ? (
                <Card>
                  <CardBody className="flex flex-col gap-3">
                    <h2 className="font-display text-2xl">{tr("plating")}</h2>
                    <p className="text-lg leading-relaxed">{recipe.plating}</p>
                  </CardBody>
                </Card>
              ) : null}

              <div className="grid gap-6 sm:grid-cols-2">
                {recipe.equipment.length ? (
                  <div>
                    <h3 className="mb-1 text-sm font-medium">{tr("equipment")}</h3>
                    <p className="text-sm text-muted">{recipe.equipment.join(" · ")}</p>
                  </div>
                ) : null}
                {recipe.allergens.length ? (
                  <div>
                    <h3 className="mb-1 text-sm font-medium">{tr("allergens")}</h3>
                    <div className="flex flex-wrap gap-1">
                      {recipe.allergens.map((a) => (
                        <Badge key={a} tone="warning">
                          {tr.has(`allergenNames.${a}`) ? tr(`allergenNames.${a}`) : a}
                        </Badge>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>

              {recipe.tips.length ? (
                <section className="flex flex-col gap-3 rounded-3xl bg-soft p-6" data-testid="public-tips">
                  <h2 className="font-display text-2xl">💡 {tr("tips")}</h2>
                  <ul className="flex list-disc flex-col gap-2 pl-5 text-muted">
                    {recipe.tips.map((tip) => (
                      <li key={tip}>{tip}</li>
                    ))}
                  </ul>
                </section>
              ) : null}
            </div>
          </div>
        </article>

        <section
          id="invitation"
          className="scroll-mt-8 overflow-hidden rounded-[2rem] bg-primary text-primary-foreground"
          data-testid="public-cta"
        >
          <div className="grid items-center gap-6 p-8 sm:p-12 md:grid-cols-[minmax(0,1fr)_auto]">
            <div className="flex flex-col gap-4">
              <h2 className="font-display text-3xl leading-tight text-balance sm:text-4xl">
                {t("ctaTitle")}
              </h2>
              <p className="text-lg opacity-90">{t("ctaText")}</p>
              <div className="flex flex-wrap gap-3 pt-2">
                <Link
                  href={{ pathname: "/", query, hash: "invitation" }}
                  className="inline-flex items-center rounded-full bg-background px-6 py-3 font-medium text-foreground shadow-sm transition hover:opacity-90"
                >
                  {t("ctaButton")}
                </Link>
                <Link
                  href={{ pathname: PUBLIC_LIST_PATH, query }}
                  className="inline-flex items-center rounded-full border border-current px-6 py-3 font-medium opacity-90 transition hover:opacity-100"
                >
                  {t("moreRecipes")}
                </Link>
              </div>
            </div>
            {/* eslint-disable-next-line @next/next/no-img-element -- illustration statique */}
            <img
              src="/mascotte-3d.png"
              alt={t("mascotAlt")}
              className="mx-auto h-56 w-auto drop-shadow-xl sm:h-72"
            />
          </div>
        </section>
      </main>
      <MobileCta label={t("topCta")} />
      <SiteFooter />
    </div>
  );
}
