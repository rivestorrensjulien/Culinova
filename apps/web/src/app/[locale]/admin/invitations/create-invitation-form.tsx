"use client";

import { Field, Input, Notice } from "@culinova/ui";
import { useActionState } from "react";
import { SubmitButton } from "@/components/submit-button";
import { createInvitationAction, type CreateInvitationState } from "@/server/actions/admin";

export function CreateInvitationForm() {
  const [state, action] = useActionState<CreateInvitationState, FormData>(createInvitationAction, {
    status: "idle",
  });
  return (
    <form action={action} className="flex flex-col gap-4">
      {state.status === "error" ? <Notice tone="danger">{state.message}</Notice> : null}
      {state.status === "created" ? (
        <Notice tone="success">
          <p className="font-medium">Code créé : il ne sera plus affiché en entier, notez-le maintenant.</p>
          <p className="my-2 font-mono text-lg tracking-widest" data-testid="invitation-code">
            {state.code}
          </p>
          <p className="break-all">
            Lien direct : <span data-testid="invitation-url">{state.url}</span>
          </p>
          {state.emailed ? <p className="mt-1">Invitation envoyée à {state.email}.</p> : null}
        </Notice>
      ) : null}
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Libellé (facultatif)" hint="Ex. : Chef Martin, testeur Lyon">
          {(a11y) => <Input name="label" maxLength={120} {...a11y} />}
        </Field>
        <Field label="E-mail (facultatif)" hint="Si renseigné, seule cette adresse pourra l’utiliser.">
          {(a11y) => <Input name="email" type="email" {...a11y} />}
        </Field>
        <Field label="Validité en jours (facultatif)" hint="Vide = sans date d’expiration.">
          {(a11y) => <Input name="expiresInDays" type="number" min={1} max={365} {...a11y} />}
        </Field>
      </div>
      <label className="flex items-center gap-3 text-sm">
        <input type="checkbox" name="send" className="size-4 accent-primary" />
        Envoyer l’invitation par e-mail à cette adresse
      </label>
      <div>
        <SubmitButton pendingLabel="Création…">Créer un code</SubmitButton>
      </div>
    </form>
  );
}
