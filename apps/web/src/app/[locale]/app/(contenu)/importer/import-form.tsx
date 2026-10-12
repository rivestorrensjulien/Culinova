"use client";

import { Button, Card, CardBody, Field, Input, Notice, Spinner, Textarea } from "@culinova/ui";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { useRouter } from "@/i18n/navigation";
import { importRecipeAction, importStatusAction } from "@/server/actions/import";

export function ImportForm() {
  const t = useTranslations("Import");
  const router = useRouter();
  const [text, setText] = useState("");
  const [url, setUrl] = useState("");
  const [pending, setPending] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!pending) return;
    const id = setInterval(async () => {
      const result = await importStatusAction(pending).catch(() => null);
      if (!result || result.status === "queued" || result.status === "running") return;
      clearInterval(id);
      if (result.status === "succeeded" && result.recipeId) router.push(`/app/recettes/${result.recipeId}`);
      else {
        setPending(null);
        setError(t("errors.failed"));
      }
    }, 2500);
    return () => clearInterval(id);
  }, [pending, router, t]);

  const submit = async () => {
    setSending(true);
    setError(null);
    const result = await importRecipeAction({ text, url }).catch(() => null);
    setSending(false);
    if (result?.ok) setPending(result.generationId);
    else if (result?.reason === "quota") setError(t("errors.quota", { limit: result.limit ?? 0 }));
    else if (result && ["empty", "url", "fetch", "budget"].includes(result.reason)) {
      setError(t(`errors.${result.reason}` as "errors.empty"));
    } else setError(t("errors.failed"));
  };

  return (
    <Card>
      <CardBody>
        <form
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          {error ? <Notice tone="danger">{error}</Notice> : null}
          <Field label={t("url")}>
            {(a11y) => (
              <Input
                type="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder={t("urlPlaceholder")}
                disabled={Boolean(pending)}
                {...a11y}
              />
            )}
          </Field>
          <Field label={t("text")} hint={t("textHint")}>
            {(a11y) => (
              <Textarea
                rows={12}
                value={text}
                maxLength={20_000}
                onChange={(e) => setText(e.target.value)}
                disabled={Boolean(pending)}
                {...a11y}
              />
            )}
          </Field>
          {pending ? (
            <p className="flex items-center gap-2 text-sm" data-testid="import-pending">
              <Spinner /> {t("pending")}
            </p>
          ) : (
            <div>
              <Button type="submit" disabled={sending || (!text.trim() && !url.trim())}>
                {t("submit")}
              </Button>
            </div>
          )}
        </form>
      </CardBody>
    </Card>
  );
}
