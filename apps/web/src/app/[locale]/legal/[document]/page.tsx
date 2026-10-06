import { Badge } from "@culinova/ui";
import { legalDocuments, type LegalDocumentType } from "@culinova/db/schema";
import { and, eq } from "drizzle-orm";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import ReactMarkdown from "react-markdown";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { getDb } from "@/server/db";

export const dynamic = "force-dynamic";

/** Adresse (en français) → type de document. */
const DOCUMENTS: Record<string, LegalDocumentType> = {
  cgu: "cgu",
  confidentialite: "privacy",
  cookies: "cookies",
  "mentions-legales": "legal_notice",
};

async function loadDocument(slug: string, locale: string) {
  const type = DOCUMENTS[slug];
  if (!type) return null;
  const db = getDb();
  const find = async (l: string) =>
    (
      await db
        .select()
        .from(legalDocuments)
        .where(
          and(
            eq(legalDocuments.type, type),
            eq(legalDocuments.locale, l),
            eq(legalDocuments.isCurrent, true),
          ),
        )
    )[0];
  return (await find(locale)) ?? (await find("fr")) ?? null;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; document: string }>;
}): Promise<Metadata> {
  const { locale, document } = await params;
  const doc = await loadDocument(document, locale);
  return { title: doc?.title };
}

export default async function LegalPage({
  params,
}: {
  params: Promise<{ locale: string; document: string }>;
}) {
  const { locale, document } = await params;
  setRequestLocale(locale);
  if (!DOCUMENTS[document]) notFound();
  const doc = await loadDocument(document, locale);
  const t = await getTranslations("Legal");

  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader />
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-12 sm:px-8">
        {doc ? (
          <article className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center gap-2">
              {doc.version.startsWith("0.") ? <Badge tone="warning">{t("draft")}</Badge> : null}
              <span className="text-sm text-muted">{t("version", { version: doc.version })}</span>
            </div>
            <h1 className="font-display text-4xl">{doc.title}</h1>
            <div className="legal-prose">
              <ReactMarkdown>{doc.bodyMd}</ReactMarkdown>
            </div>
          </article>
        ) : (
          <p className="text-muted">{t("missing")}</p>
        )}
      </main>
      <SiteFooter />
    </div>
  );
}
