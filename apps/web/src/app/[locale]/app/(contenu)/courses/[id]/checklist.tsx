"use client";

import { toDisplayQuantity } from "@culinova/core";
import { Button, Card, CardBody, cx } from "@culinova/ui";
import { useFormatter, useTranslations } from "next-intl";
import { useState } from "react";
import { Link } from "@/i18n/navigation";
import { deleteShoppingListAction, toggleShoppingItemAction } from "@/server/actions/kitchen";
import type { ShoppingListView } from "@/server/kitchen/shopping";

/** Liste de courses à cocher, rangée par rayon ; les cases cochées sont enregistrées. */
export function ShoppingChecklist({ list }: { list: ShoppingListView }) {
  const t = useTranslations("Shopping");
  const tr = useTranslations("Recipe");
  const format = useFormatter();
  const [checked, setChecked] = useState(
    () => new Set(list.groups.flatMap((g) => g.items.filter((i) => i.checked).map((i) => i.id))),
  );
  const count = list.groups.reduce((sum, g) => sum + g.items.length, 0);
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

  return (
    <div className="flex flex-col gap-6">
      <Link href="/app/courses" className="text-sm text-primary hover:underline print:hidden">
        ← {t("back")}
      </Link>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-4xl">{list.name}</h1>
          <p className="mt-1 text-muted" data-testid="shopping-progress">
            {t("progress", { checked: checked.size, count })}
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
          {list.groups.map((group) => (
            <section key={group.code ?? "other"} className="flex flex-col gap-2 break-inside-avoid">
              <h2 className="text-sm font-medium tracking-wide text-muted uppercase">
                {group.label ?? t("other")}
              </h2>
              <ul className="divide-y divide-border rounded-lg border border-border bg-surface">
                {group.items.map((item) => (
                  <li key={item.id}>
                    <label
                      className="flex cursor-pointer items-center gap-3 px-4 py-3"
                      data-testid="shopping-item"
                    >
                      <input
                        type="checkbox"
                        className="size-5 accent-primary"
                        checked={checked.has(item.id)}
                        onChange={() => toggle(item.id)}
                      />
                      <span
                        className={cx(
                          "flex flex-1 flex-col",
                          checked.has(item.id) && "text-muted line-through",
                        )}
                      >
                        <span>{item.name}</span>
                        {item.recipes.length > 0 ? (
                          <span className="text-xs text-muted no-underline">
                            {t("from", { list: item.recipes.join(", ") })}
                          </span>
                        ) : null}
                      </span>
                      <span className="text-right">
                        <span className="block font-medium tabular-nums">{quantityText(item.quantity)}</span>
                        {item.costCents !== null ? (
                          <span className="block text-xs text-muted tabular-nums">
                            {euros(item.costCents)}
                            {item.estimated ? ` · ${t("estimated")}` : ""}
                          </span>
                        ) : null}
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
        <Card className="h-fit">
          <CardBody className="flex flex-col gap-1 text-sm">
            <span className="text-muted">{t("total")}</span>
            <span className="font-display text-3xl" data-testid="shopping-total">
              {euros(list.totalCents)}
            </span>
            {list.unpricedCount > 0 ? (
              <span className="text-muted">{t("unpriced", { count: list.unpricedCount })}</span>
            ) : null}
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
