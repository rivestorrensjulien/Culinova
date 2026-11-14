/**
 * Recette d'essai (P7) : attente pendant la préparation, puis la recette pesée au gramme et
 * l'invitation à la garder (demande d'invitation, la recette rejoint le futur compte).
 * Adresse secrète, jamais indexée ; ni photo, ni prix, ni marge.
 */
import { Badge, Card, CardBody, Notice, Spinner } from "@culinova/ui";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { RequestForm } from "@/components/home/request-form";
import { ChefTips } from "@/components/recipe/chef-badge";
import { formatDuration } from "@/components/recipe/format";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { AutoRefresh } from "@/components/trial/auto-refresh";
import { Link } from "@/i18n/navigation";
import { sourceQuery } from "@/lib/request-source";
import { getDb } from "@/server/db";
import { visitSource } from "@/server/request";
import { loadTrial } from "@/server/trials";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function TrialResultPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; token: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale, token } = await params;
  setRequestLocale(locale);
  const trial = await loadTrial(getDb(), token);
  if (!trial) notFound();
  const origin = await visitSource(await searchParams);
  const query = sourceQuery(origin);
  const t = await getTranslations("Trial");
  const tr = await getTranslations("Recipe");
  const recipe = trial.recipe;
  const pending = trial.status === "queued" || trial.status === "running";

  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader />
      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-10 px-4 py-10 sm:px-8 sm:py-14">
        {pending ? (
          <Card data-testid="trial-pending">
            <CardBody className="flex flex-col items-center gap-4 py-12 text-center">
              <AutoRefresh />
              {/* eslint-disable-next-line @next/next/no-img-element -- illustration statique */}
              <img src="/mascotte-3d.png" alt="" className="h-40 w-auto drop-shadow-xl" />
              <h1 className="font-display text-3xl text-balance">{t("pendingTitle")}</h1>
              <p className="max-w-md text-muted">{t("pendingText")}</p>
              <p className="flex items-center gap-2 text-sm text-muted">
                <Spinner /> « {trial.input.input} »
              </p>
            </CardBody>
          </Card>
        ) : null}

        {trial.status === "failed" || (trial.status === "succeeded" && !recipe) ? (
          <div className="flex flex-col gap-4" data-testid="trial-failed">
            <Notice tone="danger">{t("failed")}</Notice>
            <Link href={{ pathname: "/essai", query }} className="text-primary hover:underline">
              {t("retry")}
            </Link>
          </div>
        ) : null}

        {recipe ? (
          <>
            <article className="flex flex-col gap-10" data-testid="trial-recipe">
              <header className="flex flex-col gap-4">
                <p className="text-xs font-medium tracking-[0.25em] text-primary uppercase">
                  {t("yourRecipe")}
                </p>
                <h1
                  className="font-display text-4xl leading-tight text-balance sm:text-5xl"
                  data-testid="trial-name"
                >
                  {recipe.name}
                </h1>
                <p className="text-lg text-muted">{recipe.description}</p>
                <div className="flex flex-wrap gap-2">
                  <Badge>{tr(`difficulty.${recipe.difficulty}`)}</Badge>
                  <Badge tone="sage">{tr("servings", { count: recipe.servings })}</Badge>
                  {recipe.prepS + recipe.cookS + recipe.restS > 0 ? (
                    <Badge>
                      {tr("total")} : {formatDuration(recipe.prepS + recipe.cookS + recipe.restS)}
                    </Badge>
                  ) : null}
                </div>
              </header>

              <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)] lg:gap-12">
                <div>
                  <Card className="lg:sticky lg:top-6">
                    <CardBody className="flex flex-col gap-4">
                      <h2 className="font-display text-2xl">{tr("ingredientsTitle")}</h2>
                      <ul className="flex flex-col divide-y divide-border" data-testid="trial-ingredients">
                        {recipe.ingredients.map((ingredient) => (
                          <li
                            key={`${ingredient.label}-${ingredient.amount}`}
                            className="flex items-baseline justify-between gap-4 py-2.5"
                          >
                            <span>{ingredient.label}</span>
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
                    <ol className="flex flex-col gap-5" data-testid="trial-steps">
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
                  <ChefTips title={tr("chefTips")} tips={recipe.tips} />
                </div>
              </div>
            </article>

            <section
              id="invitation"
              className="scroll-mt-8 overflow-hidden rounded-[2rem] border border-border bg-surface"
              data-testid="trial-keep"
            >
              <div className="flex flex-col gap-6 p-6 sm:p-10">
                <div className="flex flex-col gap-3">
                  <h2 className="font-display text-3xl leading-tight text-balance">{t("keepTitle")}</h2>
                  <ul className="flex flex-col gap-1.5 text-muted">
                    {(["save", "cost", "photo", "more"] as const).map((key) => (
                      <li key={key} className="flex gap-2">
                        <span aria-hidden className="text-primary">
                          ✓
                        </span>
                        {t(`keep.${key}`)}
                      </li>
                    ))}
                  </ul>
                </div>
                {trial.claimed ? (
                  <Notice tone="success">{t("claimed")}</Notice>
                ) : (
                  <RequestForm origin={origin} trialToken={trial.token} submitLabel={t("keepButton")} />
                )}
                <p className="text-xs text-muted">{t("keepNotice")}</p>
              </div>
            </section>
          </>
        ) : null}
      </main>
      <SiteFooter />
    </div>
  );
}
