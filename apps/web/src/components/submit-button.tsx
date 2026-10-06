"use client";

import { Button, type ButtonProps, Spinner } from "@culinova/ui";
import { useFormStatus } from "react-dom";

/** Bouton d'envoi de formulaire, désactivé pendant l'envoi. */
export function SubmitButton({ children, pendingLabel, ...props }: ButtonProps & { pendingLabel?: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending || props.disabled} aria-busy={pending} {...props}>
      {pending ? (
        <>
          <Spinner /> {pendingLabel ?? children}
        </>
      ) : (
        children
      )}
    </Button>
  );
}
