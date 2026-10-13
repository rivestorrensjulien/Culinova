import { buttonClasses, cx } from "@culinova/ui";
import type { Metadata } from "next";
import Image from "next/image";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { RequestForm } from "@/components/home/request-form";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { Link } from "@/i18n/navigation";
import { getDb } from "@/server/db";
import { getCurrentSession } from "@/server/session";
import { getShowcase, type ShowcaseItem } from "@/server/showcase";

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
  const [heroPhoto] = showcase;

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
    <div className="flex min-h-dvh flex-col">
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

        {/* ─── Piliers ─── */}
        <section id="fonctionnalites" className="scroll-mt-8 border-t border-border">
          <div className="mx-auto grid w-full max-w-6xl gap-10 px-4 py-20 sm:px-8 lg:grid-cols-[1fr_1.6fr]">
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
          </div>
        </section>

        {/* ─── Galerie ─── */}
        {showcase.length > 1 ? (
          <section className="border-t border-border bg-raised/50">
            <div className="mx-auto w-full max-w-6xl px-4 py-20 sm:px-8">
              <h2 className="font-display text-4xl">{t("gallery.title")}</h2>
              <p className="mt-2 text-muted">{t("gallery.lead")}</p>
              <ul className="mt-10 grid grid-cols-2 gap-4 sm:gap-6 lg:grid-cols-3">
                {showcase.map((item) => (
                  <li key={item.imageId} className="flex flex-col gap-2">
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
                  </li>
                ))}
              </ul>
            </div>
          </section>
        ) : null}

        {/* ─── Comment ça marche ─── */}
        <section id="comment" className="scroll-mt-8 border-t border-border">
          <div className="mx-auto w-full max-w-6xl px-4 py-20 sm:px-8">
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
          </div>
        </section>

        {/* ─── Pour qui ─── */}
        <section className="border-t border-border bg-soft text-soft-foreground">
          <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-14 sm:px-8 lg:flex-row lg:items-center lg:justify-between">
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
          </div>
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
          <div className="mx-auto w-full max-w-3xl px-4 py-20 sm:px-8">
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
          </div>
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
    </div>
  );
}
