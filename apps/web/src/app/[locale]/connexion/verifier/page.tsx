import { buttonClasses, Notice } from "@culinova/ui";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { AuthShell } from "@/components/auth-shell";

export const dynamic = "force-dynamic";

/**
 * Page intermédiaire du lien magique : le jeton n'est consommé qu'au clic sur le
 * bouton, pas à l'ouverture du lien (protège des analyseurs de liens des messageries).
 */
export default async function VerifyPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const query = await searchParams;
  const t = await getTranslations("Verify");

  const target = new URLSearchParams();
  for (const key of ["token", "callbackURL", "newUserCallbackURL", "errorCallbackURL"]) {
    const value = query[key];
    // Seules des adresses internes (commençant par « / ») sont acceptées comme destination.
    if (value && (key === "token" || (value.startsWith("/") && !value.startsWith("//"))))
      target.set(key, value);
  }

  return (
    <AuthShell title={t("title")}>
      {target.has("token") ? (
        <>
          <p className="text-sm text-muted">{t("intro")}</p>
          <a
            href={`/api/auth/magic-link/verify?${target.toString()}`}
            className={buttonClasses("primary", "lg")}
          >
            {t("submit")}
          </a>
        </>
      ) : (
        <Notice tone="danger">{t("invalid")}</Notice>
      )}
    </AuthShell>
  );
}
