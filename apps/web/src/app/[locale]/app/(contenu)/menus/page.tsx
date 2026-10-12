import { Card, CardBody } from "@culinova/ui";
import type { Metadata } from "next";
import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { getDb } from "@/server/db";
import { listMenus } from "@/server/kitchen/menus";
import { requireUser } from "@/server/session";
import { MenuForm } from "./menu-forms";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  return { title: (await getTranslations({ locale, namespace: "Menus" }))("title") };
}

export default async function MenusPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const session = await requireUser(locale);
  const t = await getTranslations("Menus");
  const format = await getFormatter();
  const menus = await listMenus(getDb(), session.user.id);
  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="font-display text-4xl">{t("title")}</h1>
        <p className="mt-2 max-w-2xl text-muted">{t("intro")}</p>
      </div>
      <Card>
        <CardBody className="flex flex-col gap-4">
          <h2 className="font-display text-2xl">{t("createTitle")}</h2>
          <MenuForm />
        </CardBody>
      </Card>
      {menus.length === 0 ? (
        <p className="text-muted">{t("empty")}</p>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" data-testid="menus">
          {menus.map((menu) => (
            <li key={menu.id}>
              <Link href={`/app/menus/${menu.id}`} className="block h-full">
                <Card className="h-full transition-shadow hover:shadow-lifted">
                  <CardBody className="flex flex-col gap-1">
                    <h3 className="font-display text-xl">{menu.name}</h3>
                    <p className="text-sm text-muted">
                      {[
                        t("guestsCount", { count: menu.guests }),
                        t("dishes", { count: menu.itemCount }),
                        menu.eventDate
                          ? format.dateTime(new Date(menu.eventDate), { dateStyle: "long" })
                          : null,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
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
