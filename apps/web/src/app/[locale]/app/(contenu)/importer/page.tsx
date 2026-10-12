import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { requireUser } from "@/server/session";
import { ImportForm } from "./import-form";

// L'import s'exécute après la réponse : jusqu'à 5 minutes (limite de Vercel).
export const maxDuration = 300;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  return { title: (await getTranslations({ locale, namespace: "Import" }))("title") };
}

export default async function ImportPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requireUser(locale);
  const t = await getTranslations("Import");
  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <div>
        <h1 className="font-display text-4xl">{t("title")}</h1>
        <p className="mt-2 text-muted">{t("intro")}</p>
      </div>
      <ImportForm />
    </div>
  );
}
