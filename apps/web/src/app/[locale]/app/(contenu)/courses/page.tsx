import { Card, CardBody, Notice } from "@culinova/ui";
import type { Metadata } from "next";
import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { getDb } from "@/server/db";
import { listShoppingLists } from "@/server/kitchen/shopping";
import { requireUser } from "@/server/session";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  return { title: (await getTranslations({ locale, namespace: "Shopping" }))("title") };
}

export default async function ShoppingListsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ complet?: string }>;
}) {
  const { locale } = await params;
  const { complet } = await searchParams;
  setRequestLocale(locale);
  const session = await requireUser(locale);
  const t = await getTranslations("Shopping");
  const format = await getFormatter();
  const lists = await listShoppingLists(getDb(), session.user.id);
  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="font-display text-4xl">{t("title")}</h1>
        <p className="mt-2 max-w-2xl text-muted">{t("intro")}</p>
      </div>
      {complet ? <Notice tone="success">{t("allInStock")}</Notice> : null}
      {lists.length === 0 ? (
        <p className="text-muted">{t("empty")}</p>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" data-testid="shopping-lists">
          {lists.map((list) => (
            <li key={list.id}>
              <Link href={`/app/courses/${list.id}`} className="block h-full">
                <Card className="h-full transition-shadow hover:shadow-lifted">
                  <CardBody className="flex flex-col gap-1">
                    <h2 className="font-display text-xl">{list.name}</h2>
                    <p className="text-sm text-muted">
                      {t("progress", { checked: list.checkedCount, count: list.itemCount })} ·{" "}
                      {format.dateTime(new Date(list.createdAt), { dateStyle: "medium" })}
                    </p>
                  </CardBody>
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
