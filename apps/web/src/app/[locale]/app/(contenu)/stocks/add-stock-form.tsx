"use client";

import { Field, Input, Notice, Select } from "@culinova/ui";
import { useTranslations } from "next-intl";
import { useActionState, useState } from "react";
import { SubmitButton } from "@/components/submit-button";
import { addStockAction, type StockFormState } from "@/server/actions/kitchen";

const UNITS_FOR = { kg: ["g", "kg"], l: ["ml", "cl", "l"], piece: ["piece"] } as const;

/** Ajout d'un ingrédient au stock ; les unités proposées suivent l'ingrédient choisi. */
export function AddStockForm({
  ingredients,
}: {
  ingredients: Array<{ id: string; name: string; unit: "kg" | "l" | "piece" }>;
}) {
  const t = useTranslations("Stock");
  const [state, action] = useActionState(addStockAction, { status: "idle" } as StockFormState);
  const [ingredientId, setIngredientId] = useState(ingredients[0]?.id ?? "");
  const units = UNITS_FOR[ingredients.find((i) => i.id === ingredientId)?.unit ?? "kg"];
  return (
    <form action={action} className="flex flex-col gap-4">
      {state.status === "saved" ? <Notice tone="success">{t("added")}</Notice> : null}
      {state.status === "error" ? <Notice tone="danger">{t("invalid")}</Notice> : null}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-[2fr_1fr_1fr]">
        <Field label={t("ingredient")}>
          {(a11y) => (
            <Select
              name="ingredientId"
              value={ingredientId}
              onChange={(e) => setIngredientId(e.target.value)}
              required
              {...a11y}
            >
              {ingredients.map((ingredient) => (
                <option key={ingredient.id} value={ingredient.id}>
                  {ingredient.name}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label={t("quantity")}>
          {(a11y) => <Input name="quantity" inputMode="decimal" required {...a11y} />}
        </Field>
        <Field label={t("unit")}>
          {(a11y) => (
            <Select key={units.join()} name="unit" defaultValue={units[0]} {...a11y}>
              {units.map((unit) => (
                <option key={unit} value={unit}>
                  {t(`units.${unit}`)}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label={t("bestBefore")}>{(a11y) => <Input name="bestBefore" type="date" {...a11y} />}</Field>
        <Field label={t("min")} hint={t("minHint")}>
          {(a11y) => <Input name="min" inputMode="decimal" {...a11y} />}
        </Field>
      </div>
      <div>
        <SubmitButton>{t("add")}</SubmitButton>
      </div>
    </form>
  );
}
