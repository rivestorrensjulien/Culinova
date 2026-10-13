import { buttonClasses, cx } from "@culinova/ui";
import type { Metadata } from "next";
import Image from "next/image";
import type { ReactNode } from "react";
import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";
import { type DemoExample, HomeDemo } from "@/components/home/demo";
import { MobileCta } from "@/components/home/mobile-cta";
import { RequestForm } from "@/components/home/request-form";
import { Reveal } from "@/components/home/reveal";
import { formatDuration } from "@/components/recipe/format";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { Link } from "@/i18n/navigation";
import { getDb } from "@/server/db";
import { getCurrentSession } from "@/server/session";
import { getShowcase, getShowcaseStory, type ShowcaseItem, type ShowcaseStory } from "@/server/showcase";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Home" });
  const common = await getTranslations({ locale, namespace: "Common" });
  return {
    title: { absolute: `${common("brand")} · ${common("tagline")}` },
    description: t("metaDescription"),
    openGraph: { title: common("brand"), description: t("metaDescription"), type: "website" },
  };
}

async function loadShowcase(): Promise<ShowcaseItem[]> {
  try {
    return await getShowcase(getDb());
  } catch (error) {
    console.error(`Vitrine indisponible : ${error instanceof Error ? error.message : String(error)}`);
    return [];
  }
}

async function loadStory(item: ShowcaseItem | undefined): Promise<ShowcaseStory | null> {
  if (!item) return null;
  try {
    return await getShowcaseStory(getDb(), item);
  } catch (error) {
    console.error(
      `Recette racontée indisponible : ${error instanceof Error ? error.message : String(error)}`,
    );
    return null;
  }
}

async function signedIn(): Promise<boolean> {
  try {
    return Boolean(await getCurrentSession());
  } catch {
    return false;
  }
}

/** Page d'accueil : présentation de Culinova et demande d'invitation. */
export default async function HomePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("Home");
  const common = await getTranslations("Common");
  const [showcase, connected] = await Promise.all([loadShowcase(), signedIn()]);
  // La première photo de la vitrine est racontée de bout en bout ; l'accroche montre la suivante.
  const story = await loadStory(showcase[0]);
  const heroPhoto = showcase[1] ?? showcase[0];
  const format = await getFormatter();
  const euros = (cents: number) => format.number(cents / 100, { style: "currency", currency: "EUR" });
  const demoExamples = t.raw("demo.examples") as DemoExample[];

  const pillars = t.raw("pillars.items") as Array<{ title: string; text: string }>;
  const steps = t.raw("how.steps") as Array<{ title: string; text: string }>;
  const audience = t.raw("audience.items") as string[];
  const faq = t.raw("faq.items") as Array<{ q: string; a: string }>;
  const sampleLines = t.raw("hero.sampleLines") as string[];

  const sampleCard = (
    <div
      className={cx(
        "rounded-xl border border-border bg-surface/95 p-5 shadow-lg backdrop-blur",
        heroPhoto ? "w-64 sm:w-72" : "w-full max-w-sm",
      )}
      aria-label={t("hero.sampleLabel")}
    >
      <p className="text-[11px] font-medium tracking-[0.2em] text-primary uppercase">
        {t("hero.sampleLabel")}
      </p>
      <p className="mt-2 font-display text-lg leading-snug">{t("hero.sampleName")}</p>
      <p className="mt-1 text-xs text-muted">{t("hero.sampleMeta")}</p>
      {heroPhoto ? null : (
        <>
          <p className="mt-4 text-xs font-medium tracking-wide text-muted uppercase">
            {t("hero.sampleIngredients")}
          </p>
          <ul className="mt-2 flex flex-col gap-1 text-sm">
            {sampleLines.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </>
      )}
      <dl className="mt-4 grid grid-cols-2 gap-3 border-t border-border pt-4">
        <div>
          <dt className="text-xs text-muted">{t("hero.sampleCost")}</dt>
          <dd className="font-display text-xl">{t("hero.sampleCostValue")}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted">{t("hero.samplePrice")}</dt>
          <dd className="font-display text-xl text-primary">{t("hero.samplePriceValue")}</dd>
        </div>
      </dl>
    </div>
  );

  return (
    <div className="flex min-h-dvh flex-col pb-20 md:pb-0">
      <SiteHeader>
        <nav className="hidden items-center gap-1 text-sm md:flex" aria-label={common("brand")}>
          <a href="#fonctionnalites" className="rounded-full px-3 py-1.5 text-muted hover:text-foreground">
            {t("nav.features")}
          </a>
          <a href="#comment" className="rounded-full px-3 py-1.5 text-muted hover:text-foreground">
            {t("nav.how")}
          </a>
          <a href="#questions" className="rounded-full px-3 py-1.5 text-muted hover:text-foreground">
            {t("nav.faq")}
          </a>
        </nav>
        <Link href={connected ? "/app" : "/connexion"} className={buttonClasses("secondary", "sm")}>
          {connected ? t("openApp") : t("signIn")}
        </Link>
      </SiteHeader>

      <main className="flex-1">
        {/* ─── Accroche ─── */}
        <section className="mx-auto grid w-full max-w-6xl items-center gap-12 px-4 py-14 sm:px-8 lg:grid-cols-[1.05fr_1fr] lg:py-24">
          <div className="flex flex-col items-start gap-6">
            <p className="rounded-full border border-border px-3 py-1 text-xs font-medium tracking-wide text-muted">
              {t("hero.eyebrow")}
            </p>
            <h1 className="font-display text-5xl leading-[1.02] text-balance sm:text-6xl lg:text-7xl">
              {common("tagline")}
            </h1>
            <p className="max-w-xl text-lg text-pretty text-muted">{t("hero.lead")}</p>
            <div className="flex flex-wrap gap-3">
              <a href="#invitation" className={buttonClasses("primary", "lg")} data-testid="hero-request">
                {t("hero.request")}
              </a>
              <Link href="/invitation" className={buttonClasses("ghost", "lg")}>
                {t("haveCode")}
              </Link>
            </div>
          </div>
          <div className="relative flex justify-center lg:justify-end">
            {heroPhoto ? (
              <>
                <div className="relative aspect-[4/5] w-full max-w-md overflow-hidden rounded-2xl bg-raised shadow-xl">
                  <Image
                    src={`/api/vitrine/${heroPhoto.imageId}`}
                    alt={heroPhoto.name}
                    fill
                    unoptimized
                    priority
                    sizes="(min-width: 1024px) 28rem, 100vw"
                    className="object-cover"
                  />
                </div>
                <div className="absolute -bottom-8 left-0 sm:left-4 lg:-left-6">{sampleCard}</div>
              </>
            ) : (
              sampleCard
            )}
          </div>
        </section>

        {/* ─── Une vraie recette, racontée ─── */}
        {story ? (
          <section id="comment" className="scroll-mt-8 border-t border-border" data-testid="story">
            <div className="mx-auto w-full max-w-6xl px-4 py-20 sm:px-8">
              <Reveal>
                <h2 className="font-display text-4xl leading-tight text-balance">{t("story.title")}</h2>
                <p className="mt-2 text-muted">{t("story.lead")}</p>
              </Reveal>
              <div className="mt-12 grid gap-10 lg:grid-cols-[0.9fr_1.1fr]">
                <div className="lg:sticky lg:top-8 lg:self-start">
                  <Reveal>
                    <div className="relative aspect-[4/5] overflow-hidden rounded-2xl bg-raised shadow-xl">
                      <Image
                        src={`/api/vitrine/${story.imageId}`}
                        alt={story.name}
                        fill
                        unoptimized
                        sizes="(min-width: 1024px) 30rem, 100vw"
                        className="object-cover"
                      />
                    </div>
                    <p className="mt-4 font-display text-2xl leading-snug">{story.name}</p>
                  </Reveal>
                </div>
                <ol className="flex flex-col gap-6">
                  <li>
                    <Reveal className="rounded-2xl border border-border bg-surface p-6">
                      <StoryLabel index={1}>{t("story.idea")}</StoryLabel>
                      {story.idea ? (
                        <p className="mt-3 font-display text-2xl leading-snug">« {story.idea} »</p>
                      ) : null}
                      <p className="mt-3 text-sm text-muted">
                        {t("story.people", { count: story.servings })}
                        {story.totalS > 0 ? ` · ${formatDuration(story.totalS)}` : ""}
                      </p>
                    </Reveal>
                  </li>
                  <li>
                    <Reveal className="rounded-2xl border border-border bg-surface p-6">
                      <StoryLabel index={2}>{t("story.recipe")}</StoryLabel>
                      <ul className="mt-4 grid gap-x-6 gap-y-1.5 text-sm sm:grid-cols-2">
                        {story.ingredients.slice(0, 6).map((ingredient) => (
                          <li
                            key={ingredient.label}
                            className="flex justify-between gap-3 border-b border-border/70 pb-1.5"
                          >
                            <span>{ingredient.label}</span>
                            <span className="text-right text-muted tabular-nums">{ingredient.amount}</span>
                          </li>
                        ))}
                      </ul>
                      {story.ingredients.length > 6 ? (
                        <p className="mt-2 text-xs text-muted">
                          {t("story.more", { count: story.ingredients.length - 6 })}
                        </p>
                      ) : null}
                      <ol className="mt-5 flex flex-col gap-3 text-sm">
                        {story.steps.slice(0, 2).map((step, index) => (
                          <li key={index} className="grid grid-cols-[1.75rem_1fr] gap-2">
                            <span className="flex size-6 items-center justify-center rounded-full bg-soft font-display text-soft-foreground">
                              {index + 1}
                            </span>
                            <span>{step}</span>
                          </li>
                        ))}
                      </ol>
                      <p className="mt-3 text-xs text-muted">
                        {t("story.stepsTotal", { count: story.stepCount })}
                      </p>
                    </Reveal>
                  </li>
                  <li>
                    <Reveal className="rounded-2xl border border-border bg-surface p-6">
                      <StoryLabel index={3}>{t("story.costing")}</StoryLabel>
                      {story.costPerPortionCents !== null && story.suggestedPriceTtcCents !== null ? (
                        <dl className="mt-4 grid grid-cols-2 gap-4">
                          <div>
                            <dt className="text-xs text-muted">{t("story.cost")}</dt>
                            <dd className="font-display text-3xl tabular-nums">
                              {euros(story.costPerPortionCents)}
                            </dd>
                          </div>
                          <div>
                            <dt className="text-xs text-muted">{t("story.price")}</dt>
                            <dd className="font-display text-3xl text-primary tabular-nums">
                              {euros(story.suggestedPriceTtcCents)}
                            </dd>
                          </div>
                        </dl>
                      ) : (
                        <p className="mt-3 text-sm text-muted">{t("story.noCost")}</p>
                      )}
                    </Reveal>
                  </li>
                  <li>
                    <Reveal className="rounded-2xl border border-border bg-surface p-6">
                      <StoryLabel index={4}>{t("story.photo")}</StoryLabel>
                      <p className="mt-3 text-sm text-muted">{t("story.photoText")}</p>
                      <div className="mt-4 flex items-end gap-3" aria-hidden="true">
                        {[
                          "aspect-square w-14",
                          "aspect-[4/5] w-14",
                          "aspect-[9/16] w-12",
                          "aspect-video w-20",
                        ].map((shape) => (
                          <div
                            key={shape}
                            className={cx("relative overflow-hidden rounded-md bg-raised", shape)}
                          >
                            <Image
                              src={`/api/vitrine/${story.imageId}`}
                              alt=""
                              fill
                              unoptimized
                              sizes="5rem"
                              className="object-cover"
                            />
                          </div>
                        ))}
                      </div>
                    </Reveal>
                  </li>
                  {story.caption ? (
                    <li>
                      <Reveal className="rounded-2xl border border-border bg-surface p-6">
                        <StoryLabel index={5}>{t("story.social")}</StoryLabel>
                        <p className="mt-3 text-sm text-muted">{t("story.socialText")}</p>
                        <p className="mt-2 text-sm whitespace-pre-line">
                          {story.caption.length > 320
                            ? `${story.caption.slice(0, 320).trimEnd()}…`
                            : story.caption}
                        </p>
                        {story.hashtags.length > 0 ? (
                          <p className="mt-2 text-sm text-primary">
                            {story.hashtags.map((tag) => (tag.startsWith("#") ? tag : `#${tag}`)).join(" ")}
                          </p>
                        ) : null}
                      </Reveal>
                    </li>
                  ) : null}
                  <li>
                    <a href="#invitation" className={buttonClasses("primary", "lg")}>
                      {t("story.cta")}
                    </a>
                  </li>
                </ol>
              </div>
            </div>
          </section>
        ) : (
          <section id="comment" className="scroll-mt-8 border-t border-border">
            <Reveal className="mx-auto w-full max-w-6xl px-4 py-20 sm:px-8">
              <h2 className="font-display text-4xl">{t("how.title")}</h2>
              <ol className="mt-10 grid gap-8 md:grid-cols-3">
                {steps.map((step, index) => (
                  <li key={step.title} className="flex flex-col gap-3 border-t-2 border-primary pt-5">
                    <span className="text-xs font-medium tracking-[0.2em] text-primary uppercase">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    <h3 className="font-display text-2xl">{step.title}</h3>
                    <p className="text-muted">{step.text}</p>
                  </li>
                ))}
              </ol>
            </Reveal>
          </section>
        )}

        {/* ─── Piliers ─── */}
        <section id="fonctionnalites" className="scroll-mt-8 border-t border-border">
          <Reveal className="mx-auto grid w-full max-w-6xl gap-10 px-4 py-20 sm:px-8 lg:grid-cols-[1fr_1.6fr]">
            <div className="lg:sticky lg:top-10 lg:self-start">
              <h2 className="font-display text-4xl leading-tight text-balance">{t("pillars.title")}</h2>
              <p className="mt-3 max-w-sm text-muted">{t("pillars.lead")}</p>
            </div>
            <ol className="flex flex-col divide-y divide-border">
              {pillars.map((pillar, index) => (
                <li key={pillar.title} className="grid grid-cols-[3rem_1fr] gap-4 py-6 first:pt-0">
                  <span className="font-display text-2xl text-primary">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <div>
                    <h3 className="font-display text-2xl">{pillar.title}</h3>
                    <p className="mt-1 text-muted">{pillar.text}</p>
                  </div>
                </li>
              ))}
            </ol>
          </Reveal>
        </section>

        {/* ─── Démo ─── */}
        {demoExamples.length > 0 ? (
          <section className="border-t border-border bg-raised/40">
            <Reveal className="mx-auto w-full max-w-6xl px-4 py-20 sm:px-8">
              <h2 className="font-display text-4xl">{t("demo.title")}</h2>
              <p className="mt-2 max-w-2xl text-muted">{t("demo.lead")}</p>
              <div className="mt-10">
                <HomeDemo examples={demoExamples} />
              </div>
            </Reveal>
          </section>
        ) : null}

        {/* ─── Galerie ─── */}
        {showcase.length > 1 ? (
          <section className="border-t border-border">
            <div className="mx-auto w-full max-w-6xl px-4 py-20 sm:px-8">
              <Reveal>
                <h2 className="font-display text-4xl">{t("gallery.title")}</h2>
                <p className="mt-2 text-muted">{t("gallery.lead")}</p>
              </Reveal>
              <ul className="mt-10 grid grid-cols-2 gap-4 sm:gap-6 lg:grid-cols-3">
                {showcase.map((item, index) => (
                  <li key={item.imageId}>
                    <Reveal delay={(index % 3) * 120} className="flex flex-col gap-2">
                      <div className="relative aspect-[4/5] overflow-hidden rounded-xl bg-raised">
                        <Image
                          src={`/api/vitrine/${item.imageId}`}
                          alt={item.name}
                          fill
                          unoptimized
                          sizes="(min-width: 1024px) 22rem, 50vw"
                          className="object-cover transition-transform duration-500 hover:scale-[1.03]"
                        />
                      </div>
                      <p className="font-display text-base leading-snug sm:text-lg">{item.name}</p>
                    </Reveal>
                  </li>
                ))}
              </ul>
            </div>
          </section>
        ) : null}

        {/* ─── Pour qui ─── */}
        <section className="border-t border-border bg-soft text-soft-foreground">
          <Reveal className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-14 sm:px-8 lg:flex-row lg:items-center lg:justify-between">
            <h2 className="max-w-md font-display text-3xl leading-tight text-balance">
              {t("audience.title")}
            </h2>
            <ul className="flex flex-wrap gap-2">
              {audience.map((item) => (
                <li key={item} className="rounded-full border border-current/20 px-4 py-2 text-sm">
                  {item}
                </li>
              ))}
            </ul>
          </Reveal>
        </section>

        {/* ─── Demande d'invitation ─── */}
        <section id="invitation" className="scroll-mt-8 border-t border-border">
          <div className="mx-auto grid w-full max-w-6xl gap-10 px-4 py-20 sm:px-8 lg:grid-cols-[1fr_1.3fr]">
            <div className="flex flex-col gap-4">
              <h2 className="font-display text-4xl">{t("request.title")}</h2>
              <p className="text-muted">{t("request.lead")}</p>
              <p className="border-l-2 border-gold pl-4 text-sm">{t("request.included")}</p>
            </div>
            <div className="rounded-2xl border border-border bg-surface p-6 shadow-sm sm:p-8">
              <RequestForm />
            </div>
          </div>
        </section>

        {/* ─── Questions ─── */}
        <section id="questions" className="scroll-mt-8 border-t border-border">
          <Reveal className="mx-auto w-full max-w-3xl px-4 py-20 sm:px-8">
            <h2 className="font-display text-4xl">{t("faq.title")}</h2>
            <div className="mt-8 flex flex-col divide-y divide-border border-y border-border">
              {faq.map((item) => (
                <details key={item.q} className="group py-4">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-medium">
                    {item.q}
                    <span
                      aria-hidden="true"
                      className="text-xl text-primary transition-transform group-open:rotate-45"
                    >
                      +
                    </span>
                  </summary>
                  <p className="mt-3 text-muted">{item.a}</p>
                </details>
              ))}
            </div>
          </Reveal>
        </section>

        {/* ─── Clôture ─── */}
        <section className="border-t border-border bg-foreground text-background">
          <div className="mx-auto flex w-full max-w-6xl flex-col items-start gap-6 px-4 py-16 sm:px-8 md:flex-row md:items-center md:justify-between">
            <p className="font-display text-3xl sm:text-4xl">{t("closing.title")}</p>
            <a href="#invitation" className={buttonClasses("primary", "lg")}>
              {t("closing.cta")}
            </a>
          </div>
        </section>
      </main>
      <SiteFooter />
      <MobileCta label={t("hero.request")} />
    </div>
  );
}

function StoryLabel({ index, children }: { index: number; children: ReactNode }) {
  return (
    <p className="flex items-center gap-3 text-xs font-medium tracking-[0.2em] text-primary uppercase">
      <span className="font-display text-base tracking-normal">{String(index).padStart(2, "0")}</span>
      {children}
    </p>
  );
}
