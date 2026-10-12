"use client";

import { Badge, Button, Card, CardBody, Input, Notice, Select } from "@culinova/ui";
import { useFormatter, useTranslations } from "next-intl";
import { useState } from "react";
import { Link } from "@/i18n/navigation";
import { decideInvoiceLineAction } from "@/server/actions/costing";
import type { InvoiceLineView, InvoiceView } from "@/server/costing/invoices";

const UNIT_LABEL = { kg: "€/kg", l: "€/l", piece: "€/pièce" } as const;

function displayPrice(price: string | null): string {
  return price === null ? "" : Number(price).toFixed(2).replace(".", ",");
}

/** Vérification d'une facture lue par l'IA : chaque ligne est validée ou ignorée. */
export function InvoiceReview({ invoice }: { invoice: InvoiceView }) {
  const t = useTranslations("Invoices");
  const format = useFormatter();
  const [lines, setLines] = useState(invoice.lines);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, { ingredientId: string; price: string }>>(() =>
    Object.fromEntries(
      invoice.lines.map((line) => [
        line.id,
        { ingredientId: line.ingredientId ?? "", price: displayPrice(line.proposedPrice) },
      ]),
    ),
  );

  const decide = async (line: InvoiceLineView, accept: boolean) => {
    setError(null);
    const draft = drafts[line.id]!;
    const result = await decideInvoiceLineAction(
      line.id,
      accept ? { accept: true, ingredientId: draft.ingredientId, price: draft.price } : { accept: false },
    ).catch(() => null);
    if (result?.ok) {
      setLines((all) =>
        all.map((l) => (l.id === line.id ? { ...l, decision: accept ? "accepted" : "rejected" } : l)),
      );
      return true;
    }
    setError(t("invalidPrice"));
    return false;
  };

  const ready = lines.filter(
    (l) => l.decision === "pending" && drafts[l.id]?.ingredientId && drafts[l.id]?.price.trim(),
  );

  return (
    <div className="flex flex-col gap-6">
      <Link href="/app/ingredients/factures" className="text-sm text-primary hover:underline">
        ← {t("back")}
      </Link>
      <div>
        <h1 className="font-display text-4xl" data-testid="invoice-supplier">
          {invoice.supplier ?? t("unknownSupplier")}
        </h1>
        {invoice.invoiceDate ? (
          <p className="mt-1 text-muted">
            {t("date", { date: format.dateTime(new Date(invoice.invoiceDate), { dateStyle: "long" }) })}
          </p>
        ) : null}
      </div>
      {error ? <Notice tone="danger">{error}</Notice> : null}
      {ready.length > 1 ? (
        <div>
          <Button
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              for (const line of ready) await decide(line, true);
              setBusy(false);
            }}
          >
            {t("acceptAll")}
          </Button>
        </div>
      ) : null}
      <Card>
        <CardBody>
          <ul className="flex flex-col divide-y divide-border">
            {lines.map((line) => {
              const draft = drafts[line.id]!;
              const unit = invoice.ingredients.find((i) => i.id === draft.ingredientId)?.unit;
              const setDraft = (patch: Partial<typeof draft>) =>
                setDrafts((all) => ({ ...all, [line.id]: { ...all[line.id]!, ...patch } }));
              return (
                <li key={line.id} className="flex flex-col gap-2 py-3" data-testid="invoice-line">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="font-medium">{line.rawLabel}</span>
                    <span className="text-sm text-muted">
                      {[
                        line.quantity !== null
                          ? `${format.number(line.quantity)} ${line.unit ?? ""}`.trim()
                          : null,
                        line.unitPriceCents !== null
                          ? t("unitPrice", {
                              price: format.number(line.unitPriceCents / 100, {
                                style: "currency",
                                currency: "EUR",
                              }),
                            })
                          : null,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  </div>
                  {line.decision === "pending" ? (
                    <div className="flex flex-wrap items-center gap-2 text-sm">
                      <Select
                        value={draft.ingredientId}
                        onChange={(e) => setDraft({ ingredientId: e.target.value })}
                        aria-label={`${t("ingredient")} · ${line.rawLabel}`}
                        className="w-56"
                      >
                        <option value="">{t("noMatch")}</option>
                        {invoice.ingredients.map((ingredient) => (
                          <option key={ingredient.id} value={ingredient.id}>
                            {ingredient.name}
                          </option>
                        ))}
                      </Select>
                      <label className="flex items-center gap-1.5">
                        <Input
                          className="w-24 text-right tabular-nums"
                          inputMode="decimal"
                          value={draft.price}
                          onChange={(e) => setDraft({ price: e.target.value })}
                          aria-label={`${t("price")} · ${line.rawLabel}`}
                        />
                        <span className="text-muted">{unit ? UNIT_LABEL[unit] : "€"}</span>
                      </label>
                      <Button
                        size="sm"
                        disabled={!draft.ingredientId || !draft.price.trim()}
                        onClick={() => void decide(line, true)}
                      >
                        {t("accept")}
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => void decide(line, false)}>
                        {t("reject")}
                      </Button>
                    </div>
                  ) : (
                    <div>
                      <Badge tone={line.decision === "accepted" ? "success" : "neutral"}>
                        {line.decision === "accepted" ? t("accepted") : t("rejected")}
                      </Badge>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </CardBody>
      </Card>
    </div>
  );
}
