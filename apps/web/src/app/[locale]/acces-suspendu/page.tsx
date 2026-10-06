import { getTranslations, setRequestLocale } from "next-intl/server";
import { AuthShell } from "@/components/auth-shell";
import { Link } from "@/i18n/navigation";

export default async function SuspendedPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("Suspended");
  const common = await getTranslations("Common");
  return (
    <AuthShell title={t("title")}>
      <p>{t("body")}</p>
      <Link href="/" className="text-sm font-medium text-primary hover:underline">
        {common("backHome")}
      </Link>
    </AuthShell>
  );
}
