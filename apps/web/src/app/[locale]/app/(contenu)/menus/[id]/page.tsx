import { Button, Card, CardBody, Notice, Select } from "@culinova/ui";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";
import { z } from "zod";
import { SubmitButton } from "@/components/submit-button";
import { Link } from "@/i18n/navigation";
import {
  addMenuItemAction,
  deleteMenuAction,
  menuShoppingListAction,
  removeMenuItemAction,
  updateMenuItemAction,
} from "@/server/actions/kitchen";
import { getDb } from "@/server/db";
import { COURSES, loadMenu } from "@/server/kitchen/menus";
import { requireUser } from "@/server/session";
import { MenuForm } from "../menu-forms";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  return { title: (await getTranslations({ locale, namespace: "Menus" }))("title") };
}

export default async function MenuPage({ params }: { params: Promise<{ locale: string; id: string }> }) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const session = await requireUser(locale);
  if (!z.uuid().safeParse(id).success) notFound();
  const menu = await loadMenu(getDb(), session.user.id, id);
  if (!menu) notFound();
  const t = await getTranslations("Menus");
  const format = await getFormatter();
  const euros = (cents: number) => format.number(cents / 100, { style: "currency", currency: "EUR" });

  return (
    <div className="flex flex-col gap-8">
      <Link href="/app/menus" className="text-sm text-primary hover:underline">
        ← {t("back")}
      </Link>
      <div className="flex flex-col gap-2">
        <h1 className="font-display text-4xl" data-testid="menu-name">
          {menu.name}
        </h1>
        <p className="text-muted">
          {[
            t("guestsCount", { count: menu.guests }),
            menu.eventDate ? format.dateTime(new Date(menu.eventDate), { dateStyle: "full" }) : null,
          ]
            .filter(Boolean)
            .join(" · ")}
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <div className="flex flex-col gap-6">
          <Card>
            <CardBody className="flex flex-col gap-4">
              {menu.items.length === 0 ? (
                <p className="text-muted">{t("noItem")}</p>
              ) : (
                <ul className="flex flex-col divide-y divide-border" data-testid="menu-items">
                  {menu.items.map((item) => (
                    <li key={item.id} className="flex flex-col gap-2 py-3" data-testid="menu-item">
                      <div className="flex flex-wrap items-baseline justify-between gap-3">
                        <Link href={`/app/recettes/${item.recipeId}`} className="font-medium hover:underline">
                          {item.name}
                        </Link>
                        <span className="text-sm tabular-nums">
                          {item.costCents === null ? t("noPrice") : euros(item.costCents)}
                        </span>
                      </div>
                      <div className="flex flex-wrap items-center gap-2 text-sm">
                        <form action={updateMenuItemAction} className="flex flex-wrap items-center gap-2">
                          <input type="hidden" name="itemId" value={item.id} />
                          <Select
                            name="course"
                            defaultValue={item.course}
                            aria-label={t("course")}
                            className="w-32"
                          >
                            {COURSES.map((course) => (
                              <option key={course} value={course}>
                                {t(`courses.${course}`)}
                              </option>
                            ))}
                          </Select>
                          <label className="flex items-center gap-1.5">
                            <input
                              name="servings"
                              type="number"
                              min={1}
                              max={1000}
                              defaultValue={item.servings}
                              aria-label={`${t("servings")} · ${item.name}`}
                              className="w-20 rounded-md border border-border-strong bg-surface px-2 py-1.5 text-right"
                            />
                            <span className="text-muted">{t("servings").toLowerCase()}</span>
                          </label>
                          <Button type="submit" size="sm" variant="secondary">
                            {t("update")}
                          </Button>
                        </form>
                        <form action={removeMenuItemAction}>
                          <input type="hidden" name="itemId" value={item.id} />
                          <Button type="submit" size="sm" variant="ghost">
                            {t("remove")}
                          </Button>
                        </form>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
              {menu.available.length > 0 ? (
                <form
                  action={addMenuItemAction}
                  className="flex flex-wrap items-end gap-2 border-t border-border pt-4"
                >
                  <input type="hidden" name="menuId" value={menu.id} />
                  <label className="flex min-w-60 flex-1 flex-col gap-1 text-sm">
                    <span className="font-medium">{t("addLabel")}</span>
                    <Select name="recipeId" required>
                      {menu.available.map((dish) => (
                        <option key={dish.id} value={dish.id}>
                          {dish.name}
                        </option>
                      ))}
                    </Select>
                  </label>
                  <SubmitButton>{t("add")}</SubmitButton>
                </form>
              ) : (
                <p className="text-sm text-muted">{t("noDish")}</p>
              )}
            </CardBody>
          </Card>
          <Card>
            <CardBody>
              <MenuForm menu={menu} />
            </CardBody>
          </Card>
        </div>

        <div className="flex flex-col gap-6">
          <Card>
            <CardBody className="flex flex-col gap-3 text-sm">
              <dl className="grid grid-cols-2 gap-3">
                <div>
                  <dt className="text-muted">{t("total")}</dt>
                  <dd className="font-display text-2xl" data-testid="menu-total">
                    {euros(menu.totalCents)}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted">{t("perGuest")}</dt>
                  <dd className="font-display text-2xl" data-testid="menu-per-guest">
                    {euros(menu.perGuestCents)}
                  </dd>
                </div>
              </dl>
              {menu.items.length > 0 && !menu.complete ? (
                <Notice tone="warning">{t("incomplete")}</Notice>
              ) : null}
            </CardBody>
          </Card>
          {menu.items.length > 0 ? (
            <Card>
              <CardBody className="flex flex-col items-start gap-2">
                <form action={menuShoppingListAction}>
                  <input type="hidden" name="menuId" value={menu.id} />
                  <SubmitButton>{t("shopping")}</SubmitButton>
                </form>
                <p className="text-sm text-muted">{t("shoppingHint")}</p>
              </CardBody>
            </Card>
          ) : null}
          <form action={deleteMenuAction}>
            <input type="hidden" name="id" value={menu.id} />
            <Button type="submit" variant="ghost" size="sm">
              {t("delete")}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
