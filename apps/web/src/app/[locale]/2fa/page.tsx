import { getTranslations, setRequestLocale } from "next-intl/server";
import QRCode from "qrcode";
import { AuthShell } from "@/components/auth-shell";
import { redirect } from "@/i18n/navigation";
import { getDb } from "@/server/db";
import { requireUser } from "@/server/session";
import { getTwoFactor, startEnrollment } from "@/server/two-factor";
import { TwoFactorForm } from "./two-factor-form";

export const dynamic = "force-dynamic";

/** Second facteur, réservé aux administrateurs : enrôlement puis vérification à chaque session. */
export default async function TwoFactorPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const session = await requireUser(locale);
  if (session.user.role !== "admin") redirect({ href: "/app", locale });
  if (session.twoFactorVerifiedAt) redirect({ href: "/admin", locale });

  const t = await getTranslations("TwoFactor");
  const db = getDb();
  const existing = await getTwoFactor(db, session.user.id);
  const enrollment = existing?.enabledAt
    ? null
    : await startEnrollment(db, session.user.id, session.user.email);
  const qr = enrollment
    ? await QRCode.toString(enrollment.uri, {
        type: "svg",
        margin: 1,
        color: { dark: "#1f1a16", light: "#ffffff" },
      })
    : null;

  return (
    <AuthShell title={t("title")}>
      {enrollment && qr ? (
        <>
          <p className="text-sm text-muted">{t("enrollIntro")}</p>
          <div
            className="mx-auto w-48 overflow-hidden rounded-md border border-border bg-white p-2"
            dangerouslySetInnerHTML={{ __html: qr }}
          />
          <details className="text-sm">
            <summary className="cursor-pointer text-muted">{t("manual")}</summary>
            <code
              className="mt-2 block rounded-sm bg-raised p-2 font-mono text-xs break-all"
              data-testid="totp-secret"
            >
              {enrollment.secret}
            </code>
          </details>
        </>
      ) : (
        <p className="text-sm text-muted">{t("verifyIntro")}</p>
      )}
      <TwoFactorForm />
    </AuthShell>
  );
}
