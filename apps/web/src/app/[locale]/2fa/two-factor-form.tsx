"use client";

import { buttonClasses, Field, Input, Notice } from "@culinova/ui";
import { useTranslations } from "next-intl";
import { useActionState } from "react";
import { SubmitButton } from "@/components/submit-button";
import { Link } from "@/i18n/navigation";
import { type TwoFactorState, verifyTwoFactorAction } from "@/server/actions/auth";

export function TwoFactorForm() {
  const t = useTranslations("TwoFactor");
  const [state, action] = useActionState<TwoFactorState, FormData>(verifyTwoFactorAction, { status: "idle" });

  if (state.status === "backup") {
    return (
      <div className="flex flex-col gap-4">
        <h2 className="font-display text-2xl">{t("backupTitle")}</h2>
        <Notice tone="warning">{t("backupIntro")}</Notice>
        <ul className="grid grid-cols-2 gap-2 font-mono text-sm" data-testid="backup-codes">
          {state.codes.map((code) => (
            <li key={code} className="rounded-sm bg-raised px-2 py-1 text-center">
              {code}
            </li>
          ))}
        </ul>
        <Link href="/admin" className={buttonClasses("primary")}>
          {t("continue")}
        </Link>
      </div>
    );
  }

  return (
    <form action={action} className="flex flex-col gap-4">
      {state.status === "error" ? <Notice tone="danger">{t(`errors.${state.error}`)}</Notice> : null}
      <Field label={t("code")}>
        {(a11y) => (
          <Input
            name="code"
            required
            autoComplete="one-time-code"
            inputMode="text"
            maxLength={12}
            className="font-mono tracking-widest"
            {...a11y}
          />
        )}
      </Field>
      <SubmitButton>{t("submit")}</SubmitButton>
    </form>
  );
}
