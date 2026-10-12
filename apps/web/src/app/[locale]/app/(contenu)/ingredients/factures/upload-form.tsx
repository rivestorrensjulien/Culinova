"use client";

import { Button, Field, Notice, Spinner } from "@culinova/ui";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { useRouter } from "@/i18n/navigation";

const MAX_BYTES = 4_000_000;
const MAX_SIDE = 2000;

/** Photo réduite (2 000 px, JPEG) avant l'envoi : plus légère, toujours lisible. */
async function shrink(file: File): Promise<Blob> {
  if (!file.type.startsWith("image/")) return file;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.85));
    return blob && blob.size < file.size ? blob : file;
  } catch {
    return file;
  }
}

export function InvoiceUploadForm() {
  const t = useTranslations("Invoices");
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const scan = async () => {
    if (!file) return;
    setError(null);
    setScanning(true);
    const body = await shrink(file);
    if (body.size > MAX_BYTES) {
      setScanning(false);
      setError(t("errors.size"));
      return;
    }
    const form = new FormData();
    form.set("file", body, file.name);
    const result = (await fetch("/api/factures", { method: "POST", body: form })
      .then((r) => r.json())
      .catch(() => null)) as { ok: true; invoiceId: string } | { ok: false; reason: string } | null;
    if (result?.ok) {
      router.push(`/app/ingredients/factures/${result.invoiceId}`);
      return;
    }
    setScanning(false);
    const reason = result && !result.ok ? result.reason : "failed";
    setError(t.has(`errors.${reason}`) ? t(`errors.${reason}` as "errors.failed") : t("errors.failed"));
  };

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        void scan();
      }}
    >
      {error ? <Notice tone="danger">{error}</Notice> : null}
      <Field label={t("file")} hint={t("fileHint")}>
        {(a11y) => (
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp,application/pdf"
            disabled={scanning}
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="text-sm file:mr-3 file:cursor-pointer file:rounded-full file:border file:border-border-strong file:bg-surface file:px-3 file:py-1.5"
            {...a11y}
          />
        )}
      </Field>
      {scanning ? (
        <p className="flex items-center gap-2 text-sm" data-testid="invoice-scanning">
          <Spinner /> {t("scanning")}
        </p>
      ) : (
        <div>
          <Button type="submit" disabled={!file}>
            {t("scan")}
          </Button>
        </div>
      )}
    </form>
  );
}
