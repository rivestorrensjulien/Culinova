"use client";

import { Field, Input, Notice } from "@culinova/ui";
import { useTranslations } from "next-intl";
import { useActionState } from "react";
import { SubmitButton } from "@/components/submit-button";
import { Link } from "@/i18n/navigation";
import { acceptInvitationAction, type InvitationState } from "@/server/actions/auth";

export function InvitationForm({ code, lockedEmail }: { code: string; lockedEmail: string | null }) {
  const t = useTranslations("Invitation");
  const [state, action] = useActionState<InvitationState, FormData>(acceptInvitationAction.bind(null, code), {
    status: "idle",
  });

  if (state.status === "sent") return <Notice tone="success">{t("sent", { email: state.email })}</Notice>;

  const error =
    state.status === "error"
      ? ["email", "consent", "account_exists", "server"].includes(state.error)
        ? t(`errors.${state.error as "email" | "consent" | "account_exists" | "server"}`)
        : t(`problems.${state.error as "invalid" | "revoked" | "used" | "expired" | "wrong_email" | "rate"}`)
      : null;

  return (
    <form action={action} className="flex flex-col gap-4">
      {error ? <Notice tone="danger">{error}</Notice> : null}
      <Field label={t("email")} hint={lockedEmail ? t("emailLocked") : undefined}>
        {(a11y) => (
          <Input
            name="email"
            type="email"
            autoComplete="email"
            required
            defaultValue={lockedEmail ?? undefined}
            readOnly={Boolean(lockedEmail)}
            {...a11y}
          />
        )}
      </Field>
      <Field label={t("name")}>
        {(a11y) => <Input name="name" autoComplete="name" maxLength={120} {...a11y} />}
      </Field>
      <label className="flex items-start gap-3 text-sm">
        <input type="checkbox" name="cgu" required className="mt-0.5 size-4 accent-primary" />
        <span>
          {t.rich("acceptCgu", {
            link: () => (
              <Link href="/legal/cgu" target="_blank" className="text-primary underline">
                {t("cguLink")}
              </Link>
            ),
          })}
        </span>
      </label>
      <label className="flex items-start gap-3 text-sm">
        <input type="checkbox" name="privacy" required className="mt-0.5 size-4 accent-primary" />
        <span>
          {t.rich("acceptPrivacy", {
            link: () => (
              <Link href="/legal/confidentialite" target="_blank" className="text-primary underline">
                {t("privacyLink")}
              </Link>
            ),
          })}
        </span>
      </label>
      <SubmitButton pendingLabel={t("sending")}>{t("submit")}</SubmitButton>
    </form>
  );
}
