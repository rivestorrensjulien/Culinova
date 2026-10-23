import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";

const LINKS = [
  { key: "notice", href: "/legal/mentions-legales" },
  { key: "cgu", href: "/legal/cgu" },
  { key: "privacy", href: "/legal/confidentialite" },
  { key: "cookies", href: "/legal/cookies" },
] as const;

/** Comptes Culinova sur les réseaux sociaux. */
const SOCIAL = [
  { label: "Instagram", href: "https://www.instagram.com/culinova.recette/" },
  { label: "TikTok", href: "https://www.tiktok.com/@culinova.recette" },
  { label: "Pinterest", href: "https://www.pinterest.fr/rivestorrensjulien/" },
] as const;

export async function SiteFooter() {
  const t = await getTranslations("Common");
  return (
    <footer className="mt-auto border-t border-border">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-6 text-sm text-muted sm:px-8">
        <span>
          {t("brand")} · {t("tagline")}
        </span>
        <nav className="flex flex-wrap gap-x-4 gap-y-1" aria-label={t("social")}>
          {SOCIAL.map((link) => (
            <a
              key={link.href}
              href={link.href}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-foreground"
            >
              {link.label}
            </a>
          ))}
        </nav>
        <nav className="flex flex-wrap gap-x-4 gap-y-1">
          {LINKS.map((link) => (
            <Link key={link.href} href={link.href} className="hover:text-foreground">
              {t(`legal.${link.key}`)}
            </Link>
          ))}
        </nav>
      </div>
    </footer>
  );
}
