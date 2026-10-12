"use client";

import { Field, Input, Notice } from "@culinova/ui";
import { useTranslations } from "next-intl";
import { useActionState } from "react";
import { SubmitButton } from "@/components/submit-button";
import { createMenuAction, type MenuFormState, updateMenuAction } from "@/server/actions/kitchen";

/** Création d'un menu, ou modification de son nom, ses couverts et sa date. */
export function MenuForm({
  menu,
}: {
  menu?: { id: string; name: string; guests: number; eventDate: string | null };
}) {
  const t = useTranslations("Menus");
  const [state, action] = useActionState(menu ? updateMenuAction : createMenuAction, {
    status: "idle",
  } as MenuFormState);
  return (
    <form action={action} className="flex flex-col gap-4">
      {menu ? <input type="hidden" name="id" value={menu.id} /> : null}
      {state.status === "error" ? <Notice tone="danger">{t("invalid")}</Notice> : null}
      {state.status === "saved" ? <Notice tone="success">{t("saved")}</Notice> : null}
      <div className="grid gap-4 sm:grid-cols-[2fr_1fr_1fr]">
        <Field label={t("name")}>
          {(a11y) => (
            <Input
              name="name"
              required
              maxLength={120}
              defaultValue={menu?.name ?? ""}
              placeholder={t("namePlaceholder")}
              {...a11y}
            />
          )}
        </Field>
        <Field label={t("guests")}>
          {(a11y) => (
            <Input
              name="guests"
              type="number"
              min={1}
              max={1000}
              required
              defaultValue={menu?.guests ?? 4}
              {...a11y}
            />
          )}
        </Field>
        <Field label={t("eventDate")}>
          {(a11y) => (
            <Input
              name="eventDate"
              type="date"
              defaultValue={menu?.eventDate?.slice(0, 10) ?? ""}
              {...a11y}
            />
          )}
        </Field>
      </div>
      <div>
        <SubmitButton variant={menu ? "secondary" : "primary"}>{menu ? t("save") : t("create")}</SubmitButton>
      </div>
    </form>
  );
}
