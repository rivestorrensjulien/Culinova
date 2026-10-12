"use client";

import { Field, Input, Notice } from "@culinova/ui";
import { useTranslations } from "next-intl";
import { useActionState } from "react";
import { SubmitButton } from "@/components/submit-button";
import { type AccountFormState, deleteAccountAction, updateProfileAction } from "@/server/actions/account";

const ERRORS = {
  name: "nameHint",
  mismatch: "deleteMismatch",
  last_admin: "deleteLastAdmin",
  impersonating: "deleteImpersonating",
  failed: "deleteFailed",
} as const;

export function ProfileForm({ name }: { name: string }) {
  const t = useTranslations("Account");
  const [state, action] = useActionState(updateProfileAction, { status: "idle" } as AccountFormState);
  return (
    <form action={action} className="flex flex-col gap-4">
      {state.status === "saved" ? <Notice tone="success">{t("saved")}</Notice> : null}
      {state.status === "error" ? <Notice tone="danger">{t(ERRORS[state.code])}</Notice> : null}
      <div className="max-w-sm">
        <Field label={t("name")} hint={t("nameHint")}>
          {(a11y) => <Input name="name" maxLength={80} defaultValue={name} {...a11y} />}
        </Field>
      </div>
      <div>
        <SubmitButton variant="secondary">{t("save")}</SubmitButton>
      </div>
    </form>
  );
}

export function DeleteAccountForm({ email }: { email: string }) {
  const t = useTranslations("Account");
  const [state, action] = useActionState(deleteAccountAction, { status: "idle" } as AccountFormState);
  return (
    <form action={action} className="flex flex-col gap-4">
      {state.status === "error" ? <Notice tone="danger">{t(ERRORS[state.code])}</Notice> : null}
      <div className="max-w-sm">
        <Field label={t("deleteConfirm")}>
          {(a11y) => (
            <Input name="confirm" type="email" autoComplete="off" placeholder={email} required {...a11y} />
          )}
        </Field>
      </div>
      <div>
        <SubmitButton variant="danger">{t("deleteButton")}</SubmitButton>
      </div>
    </form>
  );
}
