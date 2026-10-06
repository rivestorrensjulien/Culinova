import { Button } from "@culinova/ui";
import { getTranslations, setRequestLocale } from "next-intl/server";
import type { ReactNode } from "react";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { Link } from "@/i18n/navigation";
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

  return (
    <div className="flex min-h-dvh flex-col">
      {session.impersonatedBy ? (
        <div className="bg-warning px-4 py-2 text-center text-sm font-medium text-background">
          {t("impersonating", { email: session.user.email })}
        </div>
      ) : null}
      <SiteHeader homeHref="/app">
        <nav className="flex flex-wrap items-center gap-1 text-sm">
          <Link href="/app" className="rounded-full px-3 py-1.5 hover:bg-raised">
            {t("nav.dashboard")}
          </Link>
          <Link href="/app/creer" className="rounded-full px-3 py-1.5 hover:bg-raised">
            {t("nav.create")}
          </Link>
          <Link href="/app/recettes" className="rounded-full px-3 py-1.5 hover:bg-raised">
            {t("nav.recipes")}
          </Link>
          <Link href="/app/compte/securite" className="rounded-full px-3 py-1.5 hover:bg-raised">
            {t("nav.security")}
          </Link>
          {session.user.role === "admin" && !session.impersonatedBy ? (
            <Link href="/admin" className="rounded-full px-3 py-1.5 hover:bg-raised">
              {t("nav.admin")}
            </Link>
          ) : null}
        </nav>
        <form action={signOutAction}>
          <Button type="submit" variant="ghost" size="sm">
            {common("signOut")}
          </Button>
        </form>
      </SiteHeader>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-10 sm:px-8">{children}</main>
      <SiteFooter />
    </div>
  );
}
