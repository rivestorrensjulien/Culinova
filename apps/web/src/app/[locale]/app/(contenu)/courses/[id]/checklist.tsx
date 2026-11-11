"use client";

import { toDisplayQuantity } from "@culinova/core";
import { Button, Card, CardBody, cx } from "@culinova/ui";
import { useFormatter, useTranslations } from "next-intl";
import { useState } from "react";
import { Link } from "@/i18n/navigation";
import {
  deleteShoppingListAction,
  setShoppingItemInPantryAction,
  stockFromListAction,
  toggleShoppingItemAction,
} from "@/server/actions/kitchen";
import type { ShoppingListItemView, ShoppingListView } from "@/server/kitchen/shopping";

/**
 * Liste de courses à cocher, rangée par rayon ; les cases cochées sont enregistrées. Ce qui est déjà
 * chez soi (garde-manger, « j'en ai déjà ») est rangé à part, hors du total ; pour un particulier,
 * les basiques du placard (sel, huile, épices…) aussi.
 */
export function ShoppingChecklist({ list, proMode = false }: { list: ShoppingListView; proMode?: boolean }) {
  const t = useTranslations("Shopping");
  const tr = useTranslations("Recipe");
  const format = useFormatter();
  const [checked, setChecked] = useState(
    () => new Set(list.groups.flatMap((g) => g.items.filter((i) => i.checked).map((i) => i.id))),
  );
  const [atHome, setAtHome] = useState(
    () => new Set(list.groups.flatMap((g) => g.items.filter((i) => i.inPantry).map((i) => i.id))),
  );
  const allItems = list.groups.flatMap((g) => g.items);
  const isStaple = (item: ShoppingListItemView) => !proMode && item.staple;
  const toBuy = list.groups
    .map((g) => ({ ...g, items: g.items.filter((i) => !atHome.has(i.id) && !isStaple(i)) }))
    .filter((g) => g.items.length > 0);
  const staples = allItems.filter((i) => !atHome.has(i.id) && isStaple(i));
  const home = allItems.filter((i) => atHome.has(i.id));
  const shopping = [...toBuy.flatMap((g) => g.items), ...staples];
  const count = shopping.length;
  const checkedCount = shopping.filter((i) => checked.has(i.id)).length;
  // Total des courses : ce qui est déjà chez soi n'en fait pas partie.
  const totalCents = shopping.reduce((sum, i) => sum + (i.costCents ?? 0), 0);
  const unpriced = shopping.filter((i) => i.costCents === null).length;

  const markHome = (itemId: string, value: boolean) => {
    setAtHome((all) => {
      const copy = new Set(all);
      if (value) copy.add(itemId);
      else copy.delete(itemId);
      return copy;
    });
    void setShoppingItemInPantryAction(itemId, value).catch(() => undefined);
  };
  const [stocking, setStocking] = useState(false);
  const [stocked, setStocked] = useState<number | null>(null);
  const euros = (cents: number) => format.number(cents / 100, { style: "currency", currency: "EUR" });

  const toggle = (itemId: string) => {
    const next = !checked.has(itemId);
    setChecked((all) => {
      const copy = new Set(all);
      if (next) copy.add(itemId);
      else copy.delete(itemId);
      return copy;
    });
    void toggleShoppingItemAction(itemId, next).catch(() => undefined);
  };

  const quantityText = (quantity: ShoppingListView["groups"][number]["items"][number]["quantity"]) => {
    const display = toDisplayQuantity(quantity);
    const unit = tr(`units.${display.unit}`);
    return `${format.number(display.value, { maximumFractionDigits: 2 })}${unit ? ` ${unit}` : ""}`;
  };

  const renderItems = (items: ShoppingListItemView[]) => (
    <ul className="divide-y divide-border rounded-lg border border-border bg-surface">
      {items.map((item) => (
        <li key={item.id} className="flex items-center gap-3 px-4 py-3" data-testid="shopping-item">
          <input
            id={`item-${item.id}`}
            type="checkbox"
            className="size-5 shrink-0 accent-primary"
            checked={checked.has(item.id)}
            onChange={() => toggle(item.id)}
          />
          <label
            htmlFor={`item-${item.id}`}
            className={cx(
              "flex flex-1 cursor-pointer flex-col",
              checked.has(item.id) && "text-muted line-through",
            )}
          >
            <span>{item.name}</span>
            {item.recipes.length > 0 ? (
              <span className="text-xs text-muted no-underline">
                {t("from", { list: item.recipes.join(", ") })}
              </span>
            ) : null}
            {item.pantryQuantity ? (
              <span className="text-xs text-muted no-underline">
                {t("partlyHome", { quantity: quantityText(item.pantryQuantity) })}
              </span>
            ) : null}
            <button
              type="button"
              className="mt-0.5 w-fit text-xs text-primary hover:underline print:hidden"
              onClick={(e) => {
                e.preventDefault();
                markHome(item.id, true);
              }}
            >
              {t("haveIt")}
            </button>
          </label>
          <span className="text-right">
            <span className="block font-medium tabular-nums">{quantityText(item.quantity)}</span>
            {item.costCents !== null ? (
              <span className="block text-xs text-muted tabular-nums">
                {euros(item.costCents)}
                {item.estimated ? ` · ${t("estimated")}` : ""}
              </span>
            ) : null}
          </span>
        </li>
      ))}
    </ul>
  );

  return (
    <div className="flex flex-col gap-6">
      <Link href="/app/courses" className="text-sm text-primary hover:underline print:hidden">
        ← {t("back")}
      </Link>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-4xl">{list.name}</h1>
          <p className="mt-1 text-muted" data-testid="shopping-progress">
            {t("progress", { checked: checkedCount, count })}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 print:hidden">
          <Button variant="secondary" size="sm" onClick={() => window.print()}>
            {t("print")}
          </Button>
          <form action={deleteShoppingListAction}>
            <input type="hidden" name="id" value={list.id} />
            <Button type="submit" variant="ghost" size="sm">
              {t("delete")}
            </Button>
          </form>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <div className="flex flex-col gap-5">
          {toBuy.map((group) => (
            <section key={group.code ?? "other"} className="flex flex-col gap-2 break-inside-avoid">
              <h2 className="text-sm font-medium tracking-wide text-muted uppercase">
                {group.label ?? t("other")}
              </h2>
              {renderItems(group.items)}
            </section>
          ))}
          {staples.length > 0 ? (
            <section className="flex flex-col gap-2 break-inside-avoid" data-testid="shopping-staples">
              <h2 className="text-sm font-medium tracking-wide text-muted uppercase">{t("staplesTitle")}</h2>
              <p className="text-sm text-muted">{t("staplesHint")}</p>
              {renderItems(staples)}
            </section>
          ) : null}
          {home.length > 0 ? (
            <section className="flex flex-col gap-2 break-inside-avoid" data-testid="shopping-home">
              <h2 className="text-sm font-medium tracking-wide text-muted uppercase">{t("homeTitle")}</h2>
              <ul className="divide-y divide-border rounded-lg border border-dashed border-border">
                {home.map((item) => (
                  <li key={item.id} className="flex items-center gap-3 px-4 py-2.5 text-muted">
                    <span className="flex-1">{item.name}</span>
                    <span className="tabular-nums">{quantityText(item.quantity)}</span>
                    <button
                      type="button"
                      className="text-xs text-primary hover:underline print:hidden"
                      onClick={() => markHome(item.id, false)}
                    >
                      {t("buyAfterAll")}
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>
        <Card className="h-fit">
          <CardBody className="flex flex-col gap-1 text-sm">
            <span className="text-muted">{t("total")}</span>
            <span className="font-display text-3xl" data-testid="shopping-total">
              {euros(totalCents)}
            </span>
            {unpriced > 0 ? <span className="text-muted">{t("unpriced", { count: unpriced })}</span> : null}
            <span className="text-muted">{t(proMode ? "stockHint" : "homeStockHint")}</span>
            <div className="mt-3 flex flex-col items-start gap-2 border-t border-border pt-3 print:hidden">
              <Button
                size="sm"
                variant="secondary"
                disabled={stocking || stocked !== null || checkedCount === 0}
                onClick={async () => {
                  setStocking(true);
                  setStocked(await stockFromListAction(list.id).catch(() => 0));
                  setStocking(false);
                }}
              >
                {t(proMode ? "toStock" : "homeToStock")}
              </Button>
              {stocked !== null ? (
                <span className="text-sm" data-testid="stocked">
                  {t("stocked", { count: stocked })}
                </span>
              ) : null}
            </div>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
