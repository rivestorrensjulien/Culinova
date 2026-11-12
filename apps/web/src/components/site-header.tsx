import { ThemeSwitcher } from "@culinova/ui";
import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { Link } from "@/i18n/navigation";
import { LanguageSwitcher } from "./language-switcher";

export async function SiteHeader({
  children,
  homeHref = "/",
  mobile,
}: {
  children?: ReactNode;
  homeHref?: string;
  /** Sur téléphone, remplace tout le reste de l'en-tête (menu repliable de l'application). */
  mobile?: ReactNode;
}) {
  const t = await getTranslations("Common");
  return (
    <header className="relative border-b border-border">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-4 sm:px-8">
        <Link href={homeHref} className="text-xs font-medium tracking-[0.3em] text-primary uppercase">
          {t("brand")}
        </Link>
        {mobile}
        <div
          className={
            mobile ? "hidden flex-wrap items-center gap-3 md:flex" : "flex flex-wrap items-center gap-3"
          }
        >
          {children}
          <LanguageSwitcher />
          <ThemeSwitcher
            labels={t.raw("theme") as { group: string; light: string; dark: string; system: string }}
          />
        </div>
      </div>
    </header>
  );
}
