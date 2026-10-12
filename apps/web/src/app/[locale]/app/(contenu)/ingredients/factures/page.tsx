import { Card, CardBody } from "@culinova/ui";
import type { Metadata } from "next";
import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { listInvoices } from "@/server/costing/invoices";
import { getDb } from "@/server/db";
import { requireUser } from "@/server/session";
import { InvoiceUploadForm } from "./upload-form";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  return { title: (await getTranslations({ locale, namespace: "Invoices" }))("title") };
}

export default async function InvoicesPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const session = await requireUser(locale);
  const t = await getTranslations("Invoices");
  const format = await getFormatter();
  const invoices = await listInvoices(getDb(), session.user.id);
  return (
    <div className="flex flex-col gap-8">
      <div>
        <Link href="/app/ingredients" className="text-sm text-primary hover:underline">
          ← {(await getTranslations("App.nav"))("ingredients")}
        </Link>
        <h1 className="mt-2 font-display text-4xl">{t("title")}</h1>
        <p className="mt-2 max-w-2xl text-muted">{t("intro")}</p>
      </div>
      <Card>
        <CardBody>
          <InvoiceUploadForm />
        </CardBody>
      </Card>
      {invoices.length === 0 ? (
        <p className="text-muted">{t("empty")}</p>
      ) : (
        <ul
          className="divide-y divide-border rounded-lg border border-border bg-surface"
          data-testid="invoices"
        >
          {invoices.map((invoice) => (
            <li key={invoice.id}>
              <Link
                href={`/app/ingredients/factures/${invoice.id}`}
                className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 hover:bg-raised"
              >
                <span className="font-medium">{invoice.supplier ?? t("unknownSupplier")}</span>
                <span className="text-sm text-muted">
                  {format.dateTime(new Date(invoice.invoiceDate ?? invoice.createdAt), {
                    dateStyle: "medium",
                  })}{" "}
                  · {t("lines", { count: invoice.lineCount })} ·{" "}
                  {t("pending", { count: invoice.pendingCount })}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
