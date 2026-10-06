import { ThemeSwitcher } from "@culinova/ui";
import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { Link } from "@/i18n/navigation";
import { LanguageSwitcher } from "./language-switcher";

export async function SiteHeader({ children, homeHref = "/" }: { children?: ReactNode; homeHref?: string }) {
  const t = await getTranslations("Common");
  return (
    <header className="border-b border-border">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-4 sm:px-8">
        <Link href={homeHref} className="text-xs font-medium tracking-[0.3em] text-primary uppercase">
          {t("brand")}
        </Link>
        <div className="flex flex-wrap items-center gap-3">
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
