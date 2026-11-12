"use client";

import { cx, Field, Input, Notice } from "@culinova/ui";
import { useTranslations } from "next-intl";
import { useActionState, useTransition } from "react";
import { useRouter } from "@/i18n/navigation";
import { SubmitButton } from "@/components/submit-button";
import {
  type AccountFormState,
  deleteAccountAction,
  setProModeAction,
  updateProfileAction,
} from "@/server/actions/account";

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

/** Choix du mode : particulier (par défaut) ou professionnel. */
export function ModeChoice({ proMode }: { proMode: boolean }) {
  const t = useTranslations("Account");
  const router = useRouter();
  const [pending, start] = useTransition();
  const choose = (value: boolean) => {
    if (value === proMode || pending) return;
    start(async () => {
      await setProModeAction(value);
      router.refresh();
    });
  };
  const options = [
    { value: false, title: t("modeHomeTitle"), text: t("modeHomeText") },
    { value: true, title: t("modeProTitle"), text: t("modeProText") },
  ];
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2" role="radiogroup" aria-label={t("modeTitle")}>
      {options.map((option) => {
        const selected = option.value === proMode;
        return (
          <button
            key={String(option.value)}
            type="button"
            role="radio"
            aria-checked={selected}
            disabled={pending}
            onClick={() => choose(option.value)}
            data-testid={option.value ? "mode-pro" : "mode-home"}
            className={cx(
              "flex cursor-pointer flex-col gap-1 rounded-2xl border p-4 text-left transition",
              selected
                ? "border-primary bg-primary/5 ring-1 ring-primary"
                : "border-border hover:border-primary/60",
            )}
          >
            <span className="font-medium">
              {selected ? "● " : "○ "}
              {option.title}
            </span>
            <span className="text-sm text-muted">{option.text}</span>
          </button>
        );
      })}
    </div>
  );
}
