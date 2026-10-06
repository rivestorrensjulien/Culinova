import { Button, Field, Input } from "@culinova/ui";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { AuthShell } from "@/components/auth-shell";
import { redirect } from "@/i18n/navigation";

export const dynamic = "force-dynamic";

/** Saisie manuelle d'un code d'invitation. */
export default async function InvitationCodePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("Invitation");

  async function goToCode(formData: FormData) {
    "use server";
    const code = String(formData.get("code") ?? "")
      .trim()
      .replace(/\s+/g, "")
      .toUpperCase();
    redirect({ href: `/invitation/${encodeURIComponent(code || "-")}`, locale });
  }

  return (
    <AuthShell title={t("codeTitle")}>
      <p className="text-sm text-muted">{t("codeIntro")}</p>
      <form action={goToCode} className="flex flex-col gap-4">
        <Field label={t("code")}>
          {(a11y) => (
            <Input
              name="code"
              required
              autoComplete="off"
              placeholder="CULI-XXXX-XXXX"
              className="font-mono uppercase"
              {...a11y}
            />
          )}
        </Field>
        <Button type="submit">{t("continue")}</Button>
      </form>
    </AuthShell>
  );
}
