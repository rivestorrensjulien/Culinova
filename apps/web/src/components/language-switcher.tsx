"use client";

import { cx } from "@culinova/ui";
import { useLocale, useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";

export function LanguageSwitcher() {
  const t = useTranslations("Common");
  const locale = useLocale();
  const pathname = usePathname();
  return (
    <nav aria-label={t("language")} className="inline-flex rounded-full border border-border bg-surface p-1">
      {routing.locales.map((l) => (
        <Link
          key={l}
          href={pathname}
          locale={l}
          lang={l}
          aria-current={l === locale ? "true" : undefined}
          className={cx(
            "rounded-full px-2.5 py-1 text-xs font-medium uppercase transition-colors",
            l === locale ? "bg-foreground text-background" : "text-muted hover:text-foreground",
          )}
        >
          <span aria-hidden>{l}</span>
          <span className="sr-only">{t(`languages.${l}`)}</span>
        </Link>
      ))}
    </nav>
  );
}
