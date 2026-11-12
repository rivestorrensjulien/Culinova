import { Button, ThemeSwitcher } from "@culinova/ui";
import { getTranslations, setRequestLocale } from "next-intl/server";
import type { ReactNode } from "react";
import { MobileMenu, MobileTabBar } from "@/components/app-mobile-nav";
import { CommandButton, CommandPalette } from "@/components/command-palette";
import { LanguageSwitcher } from "@/components/language-switcher";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { Link } from "@/i18n/navigation";
import { appPages, pageLabel } from "@/lib/app-nav";
import { stopImpersonatingAction } from "@/server/actions/admin";
import { signOutAction } from "@/server/actions/auth";
import { requireUser } from "@/server/session";

export const dynamic = "force-dynamic";

export default async function AppLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const session = await requireUser(locale);
  const t = await getTranslations("App");
  const common = await getTranslations("Common");
  const proMode = session.user.proMode;

  return (
    <div className="flex min-h-dvh flex-col">
      {session.impersonatedBy ? (
        <div className="flex flex-wrap print:hidden items-center justify-center gap-3 bg-warning px-4 py-2 text-center text-sm font-medium text-background">
          {t("impersonating", { email: session.user.email })}
          <form action={stopImpersonatingAction}>
            <button type="submit" className="cursor-pointer underline underline-offset-2">
              {t("stopImpersonating")}
            </button>
          </form>
        </div>
      ) : null}
      <div className="print:hidden">
        <SiteHeader
          homeHref="/app"
          mobile={
            <MobileMenu>
              <nav className="grid grid-cols-2 gap-1 text-base">
                {appPages(proMode, "menu").map((page) => (
                  <Link key={page.key} href={page.href} className="rounded-xl px-3 py-2.5 hover:bg-raised">
                    {t(`nav.${pageLabel(page.key, proMode)}` as "nav.dashboard")}
                  </Link>
                ))}
                {session.user.role === "admin" && !session.impersonatedBy ? (
                  <Link href="/admin" className="rounded-xl px-3 py-2.5 hover:bg-raised">
                    {t("nav.admin")}
                  </Link>
                ) : null}
              </nav>
              <div className="flex flex-wrap items-center gap-3">
                <LanguageSwitcher />
                <ThemeSwitcher
                  labels={
                    common.raw("theme") as { group: string; light: string; dark: string; system: string }
                  }
                />
              </div>
              <form action={signOutAction}>
                <Button type="submit" variant="secondary" size="sm">
                  {common("signOut")}
                </Button>
              </form>
            </MobileMenu>
          }
        >
          <nav className="flex flex-wrap items-center gap-1 text-sm">
            {appPages(proMode, "menu").map((page) => (
              <Link key={page.key} href={page.href} className="rounded-full px-3 py-1.5 hover:bg-raised">
                {t(`nav.${pageLabel(page.key, proMode)}` as "nav.dashboard")}
              </Link>
            ))}
            {session.user.role === "admin" && !session.impersonatedBy ? (
              <Link href="/admin" className="rounded-full px-3 py-1.5 hover:bg-raised">
                {t("nav.admin")}
              </Link>
            ) : null}
          </nav>
          <CommandButton />
          <form action={signOutAction}>
            <Button type="submit" variant="ghost" size="sm">
              {common("signOut")}
            </Button>
          </form>
        </SiteHeader>
      </div>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-8 sm:py-10 print:max-w-none print:p-0">
        {children}
      </main>
      <div className="pb-20 md:pb-0 print:hidden">
        <SiteFooter />
      </div>
      <MobileTabBar
        tabs={(["dashboard", "create", "recipes", "shopping", "stock"] as const).map((key) => ({
          key,
          href: appPages(true, "search").find((p) => p.key === key)!.href,
          label: t(`tabs.${pageLabel(key, proMode)}` as "tabs.dashboard"),
        }))}
      />
      <CommandPalette proMode={proMode} />
    </div>
  );
}
