"use client";

import { Field, Input, Notice, Select, Textarea } from "@culinova/ui";
import { useTranslations } from "next-intl";
import { useActionState } from "react";
import { SubmitButton } from "@/components/submit-button";
import { Link } from "@/i18n/navigation";
import type { RequestSource } from "@/lib/request-source";
import { type InvitationRequestState, requestInvitationAction } from "@/server/actions/invitation-request";

const PROFILES = ["chef", "caterer", "creator", "enthusiast", "other"] as const;

/** Formulaire de demande d'invitation de la page d'accueil (`origin` : provenance de la visite). */
export function RequestForm({ origin }: { origin?: RequestSource }) {
  const t = useTranslations("Home.request");
  const [state, action] = useActionState<InvitationRequestState, FormData>(requestInvitationAction, {
    status: "idle",
  });

  if (state.status === "sent") {
    return (
      <Notice tone="success" data-testid="request-sent">
        {t("sent")}
      </Notice>
    );
  }
  const error = state.status === "error" ? state.error : null;
  const values = state.status === "error" ? state.values : null;

  return (
    <form action={action} className="flex flex-col gap-4" data-testid="request-form" noValidate>
      {error === "rate" || error === "server" ? <Notice tone="danger">{t(`errors.${error}`)}</Notice> : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t("name")} error={error === "name" ? t("errors.name") : undefined}>
          {(a11y) => (
            <Input
              name="name"
              autoComplete="name"
              required
              maxLength={120}
              defaultValue={values?.name}
              {...a11y}
            />
          )}
        </Field>
        <Field label={t("email")} error={error === "email" ? t("errors.email") : undefined}>
          {(a11y) => (
            <Input
              name="email"
              type="email"
              autoComplete="email"
              required
              maxLength={254}
              defaultValue={values?.email}
              {...a11y}
            />
          )}
        </Field>
      </div>
      <Field label={t("profile")}>
        {(a11y) => (
          <Select name="profile" defaultValue={values?.profile ?? ""} {...a11y}>
            <option value="">{t("profileNone")}</option>
            {PROFILES.map((p) => (
              <option key={p} value={p}>
                {t(`profiles.${p}`)}
              </option>
            ))}
          </Select>
        )}
      </Field>
      <Field label={t("message")}>
        {(a11y) => (
          <Textarea
            name="message"
            maxLength={1000}
            placeholder={t("messagePlaceholder")}
            defaultValue={values?.message}
            {...a11y}
          />
        )}
      </Field>
      {origin ? (
        <>
          <input type="hidden" name="src_source" value={origin.source} />
          <input type="hidden" name="src_medium" value={origin.medium ?? ""} />
          <input type="hidden" name="src_campaign" value={origin.campaign ?? ""} />
          <input type="hidden" name="src_recipe" value={origin.recipe ?? ""} />
          <input type="hidden" name="src_referrer" value={origin.referrer ?? ""} />
        </>
      ) : null}
      {/* Champ piège : invisible pour les personnes, rempli par les robots. */}
      <div aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
        <label>
          Site web
          <input type="text" name="website" tabIndex={-1} autoComplete="off" defaultValue="" />
        </label>
      </div>
      <label className="flex items-start gap-3 text-sm">
        <input
          type="checkbox"
          name="consent"
          required
          className="mt-0.5 size-4 shrink-0 accent-primary"
          aria-invalid={error === "consent" || undefined}
        />
        <span>
          {t("consent")}{" "}
          <Link href="/legal/confidentialite" className="text-primary underline-offset-2 hover:underline">
            {t("privacy")}
          </Link>
          .
        </span>
      </label>
      {error === "consent" ? <p className="-mt-2 text-xs text-danger">{t("errors.consent")}</p> : null}
      <div className="flex flex-wrap items-center gap-4">
        <SubmitButton size="lg" pendingLabel={t("sending")}>
          {t("submit")}
        </SubmitButton>
        <Link href="/invitation" className="text-sm text-muted hover:text-foreground">
          {t("already")}
        </Link>
      </div>
    </form>
  );
}
