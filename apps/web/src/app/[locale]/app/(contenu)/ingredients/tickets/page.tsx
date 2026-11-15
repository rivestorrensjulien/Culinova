/** Tickets de caisse (P8) : les particuliers remplissent « Mes prix » en photographiant leurs tickets. */
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { ScanListPage } from "../factures/scan-list";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  return { title: (await getTranslations({ locale, namespace: "Receipts" }))("title") };
}

export default async function ReceiptsPage({ params }: { params: Promise<{ locale: string }> }) {
  return <ScanListPage params={params} kind="receipt" />;
}
