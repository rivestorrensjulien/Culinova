"use client";

import type { QuotaLimits, QuotaOverrides } from "@culinova/core";
import { Field, Input, Notice } from "@culinova/ui";
import { useActionState } from "react";
import { SubmitButton } from "@/components/submit-button";
import {
  type AdminFormState,
  saveAiBudgetAction,
  saveDefaultQuotasAction,
  saveLegalIdentityAction,
  saveTrialSettingsAction,
  saveUserQuotasAction,
} from "@/server/actions/admin";
import { LEGAL_IDENTITY_FIELDS, type LegalIdentity } from "@/lib/legal";

const FIELDS = [
  { name: "recipes", label: "Recettes générées par mois" },
  { name: "images", label: "Images par mois" },
  { name: "regenerations", label: "Régénérations par recette" },
] as const;

function Result({ state }: { state: AdminFormState }) {
  if (state.status === "saved") return <Notice tone="success">{state.message}</Notice>;
  if (state.status === "error") return <Notice tone="danger">{state.message}</Notice>;
  return null;
}

/** Quotas par défaut (vide = sans limite). */
export function DefaultQuotasForm({ values }: { values: QuotaLimits }) {
  const [state, action] = useActionState(saveDefaultQuotasAction, { status: "idle" } as AdminFormState);
  return (
    <form action={action} className="flex flex-col gap-4">
      <Result state={state} />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {FIELDS.map((f) => (
          <Field key={f.name} label={f.label} hint="Vide = sans limite.">
            {(a11y) => (
              <Input
                name={f.name}
                inputMode="numeric"
                defaultValue={values[f.name] === null ? "" : String(values[f.name])}
                {...a11y}
              />
            )}
          </Field>
        ))}
      </div>
      <div>
        <SubmitButton pendingLabel="Enregistrement…">Enregistrer les quotas</SubmitButton>
      </div>
    </form>
  );
}

/** Exceptions d'une personne (vide = valeur par défaut). */
export function UserQuotasForm({
  userId,
  overrides,
  defaults,
}: {
  userId: string;
  overrides: QuotaOverrides;
  defaults: QuotaLimits;
}) {
  const [state, action] = useActionState(saveUserQuotasAction, { status: "idle" } as AdminFormState);
  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="id" value={userId} />
      <Result state={state} />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {FIELDS.map((f) => {
          const fallback = defaults[f.name];
          return (
            <Field
              key={f.name}
              label={f.label}
              hint={`Vide = valeur par défaut (${fallback === null ? "sans limite" : fallback}).`}
            >
              {(a11y) => (
                <Input
                  name={f.name}
                  inputMode="numeric"
                  defaultValue={
                    overrides[f.name] === undefined || overrides[f.name] === null
                      ? ""
                      : String(overrides[f.name])
                  }
                  {...a11y}
                />
              )}
            </Field>
          );
        })}
      </div>
      <div>
        <SubmitButton pendingLabel="Enregistrement…">Enregistrer ses quotas</SubmitButton>
      </div>
    </form>
  );
}

/** Plafond mensuel du budget IA, en dollars (vide = pas de plafond). */
export function AiBudgetForm({ value }: { value: string }) {
  const [state, action] = useActionState(saveAiBudgetAction, { status: "idle" } as AdminFormState);
  return (
    <form action={action} className="flex flex-col gap-4">
      <Result state={state} />
      <div className="max-w-xs">
        <Field
          label="Plafond mensuel (en dollars)"
          hint="Au-delà, plus aucune génération jusqu’au 1er du mois. Vide = pas de plafond."
        >
          {(a11y) => <Input name="cap" inputMode="decimal" defaultValue={value} {...a11y} />}
        </Field>
      </div>
      <div>
        <SubmitButton pendingLabel="Enregistrement…">Enregistrer le plafond</SubmitButton>
      </div>
    </form>
  );
}

/** Recettes d'essai sans compte (pages publiques). */
export function TrialSettingsForm({ enabled, dailyLimit }: { enabled: boolean; dailyLimit: number }) {
  const [state, action] = useActionState(saveTrialSettingsAction, { status: "idle" } as AdminFormState);
  return (
    <form action={action} className="flex flex-col gap-4">
      <Result state={state} />
      <label className="flex items-start gap-3">
        <input
          type="checkbox"
          name="enabled"
          defaultChecked={enabled}
          className="mt-0.5 size-4 accent-primary"
        />
        <span>
          <span className="font-medium">Essais ouverts</span>
          <span className="block text-sm text-muted">
            Bouton « Essayer sans inscription » sur la page d’accueil et les pages publiques des recettes.
          </span>
        </span>
      </label>
      <div className="max-w-xs">
        <Field
          label="Essais au plus par 24 heures (tout le site)"
          hint="Chaque essai coûte environ 0,10 $ d’IA. 2 essais au plus par jour et par connexion."
        >
          {(a11y) => (
            <Input name="dailyLimit" inputMode="numeric" defaultValue={String(dailyLimit)} {...a11y} />
          )}
        </Field>
      </div>
      <div>
        <SubmitButton pendingLabel="Enregistrement…">Enregistrer les essais</SubmitButton>
      </div>
    </form>
  );
}

/** Identité de l'éditeur (mentions légales, confidentialité, CGU). */
export function LegalIdentityForm({ values }: { values: LegalIdentity }) {
  const [state, action] = useActionState(saveLegalIdentityAction, { status: "idle" } as AdminFormState);
  return (
    <form action={action} className="flex flex-col gap-4">
      <Result state={state} />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {LEGAL_IDENTITY_FIELDS.map((f) => (
          <Field key={f.key} label={f.label} hint={f.hint}>
            {(a11y) => <Input name={f.key} maxLength={300} defaultValue={values[f.key] ?? ""} {...a11y} />}
          </Field>
        ))}
      </div>
      <div>
        <SubmitButton pendingLabel="Enregistrement…">Enregistrer les informations légales</SubmitButton>
      </div>
    </form>
  );
}
