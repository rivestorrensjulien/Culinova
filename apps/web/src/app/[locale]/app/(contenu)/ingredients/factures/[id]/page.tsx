import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getLocale, getTranslations, setRequestLocale } from "next-intl/server";
import { z } from "zod";
import { loadInvoice } from "@/server/costing/invoices";
import { getDb } from "@/server/db";
import { requireUser } from "@/server/session";
import { InvoiceReview } from "./review";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  return { title: (await getTranslations({ locale, namespace: "Invoices" }))("title") };
}

export default async function InvoicePage({ params }: { params: Promise<{ locale: string; id: string }> }) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const session = await requireUser(locale);
  if (!z.uuid().safeParse(id).success) notFound();
  const invoice = await loadInvoice(getDb(), session.user.id, id, await getLocale());
  if (!invoice) notFound();
  return <InvoiceReview invoice={invoice} />;
}
