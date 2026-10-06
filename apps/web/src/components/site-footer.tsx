import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";

export async function SiteFooter() {
  const t = await getTranslations("Common");
  return (
    <footer className="mt-auto border-t border-border">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-6 text-sm text-muted sm:px-8">
        <span>
          {t("brand")} · {t("tagline")}
        </span>
        <nav className="flex gap-4">
          <Link href="/legal/cgu" className="hover:text-foreground">
            {t("legal.cgu")}
          </Link>
          <Link href="/legal/confidentialite" className="hover:text-foreground">
            {t("legal.privacy")}
          </Link>
        </nav>
      </div>
    </footer>
  );
}
