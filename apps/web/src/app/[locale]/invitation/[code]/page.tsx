import { Notice } from "@culinova/ui";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { AuthShell } from "@/components/auth-shell";
import { Link } from "@/i18n/navigation";
import { findInvitationByCode, invitationProblem } from "@/server/access/invitations";
import { getDb } from "@/server/db";
import { isAllowed, RATE_RULES, recordAttempt } from "@/server/rate-limit";
import { requestMeta } from "@/server/request";
import { InvitationForm } from "./invitation-form";

export const dynamic = "force-dynamic";

export default async function InvitationPage({
  params,
}: {
  params: Promise<{ locale: string; code: string }>;
}) {
  const { locale, code: rawCode } = await params;
  setRequestLocale(locale);
  const code = decodeURIComponent(rawCode);
  const t = await getTranslations("Invitation");
  const db = getDb();
  const { ip } = await requestMeta();

  let problem: string | null = null;
  let lockedEmail: string | null = null;
  if (
    !(await isAllowed(db, "invitation", [
      { by: { ip: ip ?? undefined }, rule: RATE_RULES.invitationFailuresPerIp },
    ]))
  ) {
    problem = "rate";
  } else {
    const invitation = await findInvitationByCode(db, code);
    problem = invitationProblem(invitation);
    if (problem) await recordAttempt(db, { kind: "invitation", ip, success: false });
    lockedEmail = invitation?.email ?? null;
  }

  return (
    <AuthShell title={t("title")}>
      {problem ? (
        <>
          <Notice tone="danger">
            {t(`problems.${problem as "invalid" | "revoked" | "used" | "expired" | "wrong_email" | "rate"}`)}
          </Notice>
          <Link href="/invitation" className="text-sm font-medium text-primary hover:underline">
            {t("codeTitle")}
          </Link>
        </>
      ) : (
        <>
          <p className="text-sm text-muted">{t("intro")}</p>
          <p className="rounded-md bg-raised px-3 py-2 text-center font-mono tracking-widest">
            {code.toUpperCase()}
          </p>
          <InvitationForm code={code} lockedEmail={lockedEmail} />
        </>
      )}
      <p className="text-sm text-muted">
        {t("alreadyAccount")}{" "}
        <Link href="/connexion" className="font-medium text-primary hover:underline">
          {t("signIn")}
        </Link>
      </p>
    </AuthShell>
  );
}
