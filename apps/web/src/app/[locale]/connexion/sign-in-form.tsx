"use client";

import { Field, Input, Notice } from "@culinova/ui";
import { useTranslations } from "next-intl";
import { useActionState } from "react";
import { SubmitButton } from "@/components/submit-button";
import { signInAction, type SignInState } from "@/server/actions/auth";

export function SignInForm() {
  const t = useTranslations("SignIn");
  const [state, action] = useActionState<SignInState, FormData>(signInAction, { status: "idle" });

  if (state.status === "sent") {
    return <Notice tone="success">{t("sent", { email: state.email })}</Notice>;
  }
  return (
    <form action={action} className="flex flex-col gap-4">
      {state.status === "error" ? <Notice tone="danger">{t(`errors.${state.error}`)}</Notice> : null}
      <Field label={t("email")}>
        {(a11y) => (
          <Input
            name="email"
            type="email"
            autoComplete="email"
            required
            placeholder="vous@exemple.fr"
            {...a11y}
          />
        )}
      </Field>
      <SubmitButton pendingLabel={t("sending")}>{t("submit")}</SubmitButton>
    </form>
  );
}
