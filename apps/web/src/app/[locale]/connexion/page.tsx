import { Notice } from "@culinova/ui";
import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { AuthShell } from "@/components/auth-shell";
import { Link } from "@/i18n/navigation";
import { redirect } from "@/i18n/navigation";
import { getCurrentSession } from "@/server/session";
import { SignInForm } from "./sign-in-form";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  return { title: (await getTranslations({ locale, namespace: "SignIn" }))("title") };
}

const REASONS = ["lien", "session", "invitation", "supprime"] as const;

export default async function SignInPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ raison?: string; error?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  if (await getCurrentSession()) redirect({ href: "/app", locale });
  const { raison, error } = await searchParams;
  const reason = error === "INVITATION_REQUIRED" ? "invitation" : REASONS.find((r) => r === raison);
  const t = await getTranslations("SignIn");
  return (
    <AuthShell title={t("title")}>
      {reason ? (
        <Notice tone={reason === "supprime" ? "success" : "warning"}>{t(`reasons.${reason}`)}</Notice>
      ) : null}
      <p className="text-sm text-muted">{t("intro")}</p>
      <SignInForm />
      <p className="text-sm text-muted">
        {t("noAccount")}{" "}
        <Link href="/invitation" className="font-medium text-primary hover:underline">
          {t("useCode")}
        </Link>
      </p>
    </AuthShell>
  );
}
