"use client";

import { Badge, Button, cx, Input } from "@culinova/ui";
import { useFormatter, useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import { Link } from "@/i18n/navigation";
import { confirmIngredientAction, savePriceAction } from "@/server/actions/costing";
import type { IngredientRow } from "@/server/costing/ingredients";

type Filter = "all" | "missing";

export function IngredientsTable({ rows: initial }: { rows: IngredientRow[] }) {
  const t = useTranslations("Ingredients");
  const format = useFormatter();
  const [rows, setRows] = useState(initial);
  const [filter, setFilter] = useState<Filter>(initial.some((r) => !r.price) ? "missing" : "all");
  const [query, setQuery] = useState("");
  // Une ligne chiffrée pendant la visite reste affichée, même avec le filtre « Sans prix ».
  const [savedNow, setSavedNow] = useState<ReadonlySet<string>>(new Set());
  const missingCount = rows.filter((r) => !r.price).length;

  const visible = useMemo(() => {
    const q = query.trim().toLocaleLowerCase();
    return rows.filter(
      (r) =>
        (filter === "all" || !r.price || savedNow.has(r.id)) &&
        (q === "" || r.name.toLocaleLowerCase().includes(q)),
    );
  }, [rows, filter, query, savedNow]);

  const update = (id: string, patch: Partial<IngredientRow>) =>
    setRows((current) => current.map((r) => (r.id === id ? { ...r, ...patch } : r)));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex gap-1" role="group" aria-label={t("filter")}>
          {(["missing", "all"] as const).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              aria-pressed={filter === f}
              className={cx(
                "cursor-pointer rounded-full border px-3 py-1 text-sm",
                filter === f
                  ? "border-foreground bg-foreground text-background"
                  : "border-border text-muted hover:text-foreground",
              )}
            >
              {f === "missing"
                ? t("filterMissing", { count: missingCount })
                : t("filterAll", { count: rows.length })}
            </button>
          ))}
        </div>
        <Input
          className="max-w-64"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("search")}
          aria-label={t("search")}
        />
      </div>

      {visible.length === 0 ? (
        <p className="text-sm text-muted">{filter === "missing" ? t("allPriced") : t("noMatch")}</p>
      ) : (
        <ul className="divide-y divide-border rounded-lg border border-border bg-surface">
          {visible.map((row) => (
            <PriceRow
              key={row.id}
              row={row}
              onSaved={(price, supplierName) => {
                setSavedNow((ids) => new Set(ids).add(row.id));
                update(row.id, {
                  price,
                  priceIsOwn: true,
                  supplierName,
                  priceUpdatedAt: new Date().toISOString(),
                });
              }}
              onConfirmed={() => update(row.id, { toConfirm: false })}
              formatDate={(iso) => format.dateTime(new Date(iso), { dateStyle: "short" })}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function PriceRow({
  row,
  onSaved,
  onConfirmed,
  formatDate,
}: {
  row: IngredientRow;
  onSaved: (price: string, supplierName: string | null) => void;
  onConfirmed: () => void;
  formatDate: (iso: string) => string;
}) {
  const t = useTranslations("Ingredients");
  const format = useFormatter();
  const [price, setPrice] = useState(row.price ? displayPrice(row.price) : "");
  const [supplier, setSupplier] = useState(row.supplierName ?? "");
  const [state, setState] = useState<"idle" | "saving" | "saved" | "invalid">("idle");

  const save = async () => {
    setState("saving");
    const result = await savePriceAction(row.id, price, supplier.trim() || null).catch(() => null);
    if (result?.ok) {
      onSaved(result.price, supplier.trim() || null);
      setPrice(displayPrice(result.price));
      setState("saved");
    } else {
      setState("invalid");
    }
  };

  return (
    <li
      className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between"
      data-testid="price-row"
    >
      <div className="flex min-w-0 flex-col gap-1">
        <span className="flex flex-wrap items-center gap-2 font-medium">
          {row.name}
          {row.toConfirm ? (
            <Badge tone="warning" title={t("toConfirmHint")}>
              {t("toConfirm")}
            </Badge>
          ) : null}
        </span>
        <span className="text-xs text-muted">
          {row.recipes.length > 0
            ? row.recipes.map((r, i) => (
                <span key={r.id}>
                  {i > 0 ? ", " : ""}
                  <Link href={`/app/recettes/${r.id}`} className="hover:underline">
                    {r.name}
                  </Link>
                </span>
              ))
            : t("unused")}
        </span>
        {row.price ? (
          <span className="text-xs text-muted">
            {row.priceIsOwn ? t("ownPrice") : t("referencePrice")}
            {row.priceUpdatedAt ? ` · ${formatDate(row.priceUpdatedAt)}` : ""}
          </span>
        ) : null}
      </div>

      <form
        className="flex flex-wrap items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <label className="flex items-center gap-1.5 text-sm">
          <Input
            className="w-24 text-right tabular-nums"
            inputMode="decimal"
            value={price}
            onChange={(e) => {
              setPrice(e.target.value);
              setState("idle");
            }}
            placeholder="0,00"
            aria-label={t("priceLabel", { name: row.name })}
          />
          <span className="whitespace-nowrap text-muted">{t(`unit.${row.unit}`)}</span>
        </label>
        <Input
          className="w-40"
          value={supplier}
          onChange={(e) => setSupplier(e.target.value)}
          placeholder={t("supplier")}
          aria-label={t("supplierLabel", { name: row.name })}
        />
        <Button
          type="submit"
          size="sm"
          variant="secondary"
          disabled={state === "saving" || price.trim() === ""}
        >
          {t("save")}
        </Button>
        {row.toConfirm ? (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={async () => {
              if (await confirmIngredientAction(row.id).catch(() => false)) onConfirmed();
            }}
          >
            {t("confirm")}
          </Button>
        ) : null}
        <span className="w-full text-xs sm:w-auto" aria-live="polite">
          {state === "saved" ? (
            <span className="text-success">
              {t("saved", {
                price: format.number(Number(row.price ?? 0), { style: "currency", currency: "EUR" }),
              })}
            </span>
          ) : state === "invalid" ? (
            <span className="text-danger">{t("invalid")}</span>
          ) : null}
        </span>
      </form>
    </li>
  );
}

/** « 9.8000 » → « 9,80 » pour la saisie (2 décimales au moins, 4 au plus). */
function displayPrice(price: string): string {
  const value = Number(price);
  const text = value.toFixed(4).replace(/0{1,2}$/, "");
  return text.replace(".", ",");
}
