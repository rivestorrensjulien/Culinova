"use client";

import { cx } from "@culinova/ui";
import { useTranslations } from "next-intl";
import { type ReactNode, useEffect, useRef } from "react";
import { Link, usePathname } from "@/i18n/navigation";

/**
 * Sur téléphone (décision de Julien du 11/11, « mobile d'abord ») : l'en-tête se résume au nom et
 * à un bouton « Menu » qui déplie toutes les pages, la langue, le thème et la déconnexion ; les
 * pages les plus utilisées sont dans une barre d'onglets en bas de l'écran.
 */
export function MobileMenu({ children }: { children: ReactNode }) {
  const t = useTranslations("App");
  const pathname = usePathname();
  const ref = useRef<HTMLDetailsElement>(null);
  // Une page choisie dans le menu le referme.
  useEffect(() => {
    if (ref.current) ref.current.open = false;
  }, [pathname]);
  return (
    <details ref={ref} className="group md:hidden">
      <summary
        className="flex cursor-pointer list-none items-center gap-2 rounded-full border border-border px-4 py-2 text-sm font-medium [&::-webkit-details-marker]:hidden"
        data-testid="mobile-menu"
      >
        <svg viewBox="0 0 20 20" aria-hidden className="size-4 fill-none stroke-current stroke-2">
          <path d="M3 6h14M3 10h14M3 14h14" className="group-open:hidden" />
          <path d="M5 5l10 10M15 5L5 15" className="hidden group-open:block" />
        </svg>
        {t("menu")}
      </summary>
      <div className="absolute inset-x-0 top-full z-40 flex flex-col gap-4 border-b border-border bg-background px-4 pt-2 pb-6 shadow-lg">
        {children}
      </div>
    </details>
  );
}

type TabKey = "dashboard" | "create" | "recipes" | "shopping" | "stock";

const ICONS: Record<TabKey, ReactNode> = {
  dashboard: <path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z" />,
  create: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 8v8M8 12h8" />
    </>
  ),
  recipes: <path d="M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3zM5 17a3 3 0 0 1 3-3h11" />,
  shopping: (
    <>
      <path d="M3 4h2l2.4 11h10.2L20 7H6.2" />
      <circle cx="9" cy="19.5" r="1.3" />
      <circle cx="17" cy="19.5" r="1.3" />
    </>
  ),
  stock: <path d="M7 3h10v3H7zM6 6h12l-1 15H7zM9 11h6" />,
};

/** Barre d'onglets du bas, sur téléphone seulement (cachée en mode préparation). */
export function MobileTabBar({ tabs }: { tabs: { key: TabKey; href: string; label: string }[] }) {
  const pathname = usePathname();
  if (pathname.endsWith("/preparation")) return null;
  const active = (href: string) => (href === "/app" ? pathname === "/app" : pathname.startsWith(href));
  return (
    <nav
      aria-label="Navigation"
      className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden print:hidden"
      data-testid="mobile-tabs"
    >
      <ul className="mx-auto grid max-w-md grid-cols-5">
        {tabs.map((tab) => (
          <li key={tab.key}>
            <Link
              href={tab.href}
              aria-current={active(tab.href) ? "page" : undefined}
              className={cx(
                "flex flex-col items-center gap-1 px-1 py-2 text-[11px] leading-tight",
                active(tab.href) ? "text-primary" : "text-muted",
              )}
            >
              <svg
                viewBox="0 0 24 24"
                aria-hidden
                className="size-6 fill-none stroke-current stroke-[1.7] [stroke-linecap:round] [stroke-linejoin:round]"
              >
                {ICONS[tab.key]}
              </svg>
              <span className="truncate">{tab.label}</span>
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
