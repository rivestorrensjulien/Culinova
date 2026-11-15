import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { ScanListPage } from "./scan-list";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  return { title: (await getTranslations({ locale, namespace: "Invoices" }))("title") };
}

export default async function InvoicesPage({ params }: { params: Promise<{ locale: string }> }) {
  return <ScanListPage params={params} kind="invoice" />;
}
