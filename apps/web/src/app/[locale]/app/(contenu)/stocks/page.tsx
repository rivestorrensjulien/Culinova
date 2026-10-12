import { toDisplayQuantity } from "@culinova/core";
import { Badge, Button, Card, CardBody, Notice } from "@culinova/ui";
import type { Metadata } from "next";
import { getFormatter, getLocale, getTranslations, setRequestLocale } from "next-intl/server";
import { removeStockAction, updateStockAction } from "@/server/actions/kitchen";
import { listMyIngredients } from "@/server/costing/ingredients";
import { getDb } from "@/server/db";
import { listStock } from "@/server/kitchen/stock";
import { requireUser } from "@/server/session";
import { AddStockForm } from "./add-stock-form";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  return { title: (await getTranslations({ locale, namespace: "Stock" }))("title") };
}

export default async function StockPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const session = await requireUser(locale);
  const t = await getTranslations("Stock");
  const tr = await getTranslations("Recipe");
  const format = await getFormatter();
  const db = getDb();
  const language = await getLocale();
  const [items, ingredients] = await Promise.all([
    listStock(db, session.user.id, language),
    listMyIngredients(db, session.user.id, { languageCode: language }),
  ]);
  const low = items.filter((i) => i.low).length;
  const soon = items.filter((i) => i.expiring).length;
  const inputClass = "rounded-md border border-border-strong bg-surface px-2 py-1.5 text-right";

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="font-display text-4xl">{t("title")}</h1>
        <p className="mt-2 max-w-2xl text-muted">{t("intro")}</p>
      </div>
      {low > 0 || soon > 0 ? (
        <Notice tone="warning">
          {[low > 0 ? t("lowCount", { count: low }) : null, soon > 0 ? t("soonCount", { count: soon }) : null]
            .filter(Boolean)
            .join(" · ")}
        </Notice>
      ) : null}
      <Card>
        <CardBody className="flex flex-col gap-4">
          <h2 className="font-display text-2xl">{t("addTitle")}</h2>
          {ingredients.length === 0 ? (
            <p className="text-muted">{t("noIngredient")}</p>
          ) : (
            <AddStockForm ingredients={ingredients.map((i) => ({ id: i.id, name: i.name, unit: i.unit }))} />
          )}
        </CardBody>
      </Card>
      {items.length === 0 ? (
        <p className="text-muted">{t("empty")}</p>
      ) : (
        <ul className="divide-y divide-border rounded-lg border border-border bg-surface" data-testid="stock">
          {items.map((item) => {
            const display = toDisplayQuantity(item.quantity);
            const unit = tr(`units.${display.unit}`);
            return (
              <li key={item.id} className="flex flex-col gap-2 p-4" data-testid="stock-item">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="flex flex-wrap items-center gap-2 font-medium">
                    {item.name}
                    {item.low ? <Badge tone="warning">{t("low")}</Badge> : null}
                    {item.expiring ? (
                      <Badge tone={item.expiring === "expired" ? "danger" : "warning"}>
                        {t(item.expiring)}
                      </Badge>
                    ) : null}
                  </span>
                  <span className="font-medium tabular-nums" data-testid="stock-quantity">
                    {format.number(display.value, { maximumFractionDigits: 2 })}
                    {unit ? ` ${unit}` : ""}
                    {item.bestBefore
                      ? ` · ${t("bestBeforeShort")} ${format.dateTime(new Date(item.bestBefore), { dateStyle: "short" })}`
                      : ""}
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <form action={updateStockAction} className="flex flex-wrap items-center gap-2">
                    <input type="hidden" name="itemId" value={item.id} />
                    <label className="flex items-center gap-1.5">
                      <input
                        name="value"
                        inputMode="decimal"
                        defaultValue={String(item.quantity.value).replace(".", ",")}
                        aria-label={`${t("quantity")} · ${item.name}`}
                        className={`w-24 ${inputClass}`}
                      />
                      <span className="text-muted">{t(`baseUnit.${item.quantity.dimension}`)}</span>
                    </label>
                    <label className="flex items-center gap-1.5">
                      <span className="text-muted">{t("minShort")}</span>
                      <input
                        name="min"
                        inputMode="decimal"
                        defaultValue={item.min === null ? "" : String(item.min).replace(".", ",")}
                        aria-label={`${t("minShort")} · ${item.name}`}
                        className={`w-20 ${inputClass}`}
                      />
                    </label>
                    <label className="flex items-center gap-1.5">
                      <span className="text-muted">{t("bestBeforeShort")}</span>
                      <input
                        name="bestBefore"
                        type="date"
                        defaultValue={item.bestBefore?.slice(0, 10) ?? ""}
                        aria-label={`${t("bestBeforeShort")} · ${item.name}`}
                        className={inputClass}
                      />
                    </label>
                    <Button type="submit" size="sm" variant="secondary">
                      {t("update")}
                    </Button>
                  </form>
                  <form action={removeStockAction}>
                    <input type="hidden" name="itemId" value={item.id} />
                    <Button type="submit" size="sm" variant="ghost">
                      {t("remove")}
                    </Button>
                  </form>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
