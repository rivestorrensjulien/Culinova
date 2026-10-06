"use client";

import { Button } from "@culinova/ui";
import { useTranslations } from "next-intl";
import { useState } from "react";

export function CopyButton({ text }: { text: string }) {
  const t = useTranslations("Recipe");
  const [copied, setCopied] = useState(false);
  return (
    <Button
      size="sm"
      variant="ghost"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        } catch {
          // Presse-papiers indisponible : l'utilisateur peut sélectionner le texte.
        }
      }}
    >
      {copied ? t("copied") : t("copy")}
    </Button>
  );
}
