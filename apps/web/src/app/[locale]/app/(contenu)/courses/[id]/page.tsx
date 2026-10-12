import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getLocale, getTranslations, setRequestLocale } from "next-intl/server";
import { z } from "zod";
import { getDb } from "@/server/db";
import { loadShoppingList } from "@/server/kitchen/shopping";
import { requireUser } from "@/server/session";
import { ShoppingChecklist } from "./checklist";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  return { title: (await getTranslations({ locale, namespace: "Shopping" }))("title") };
}

export default async function ShoppingListPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const session = await requireUser(locale);
  if (!z.uuid().safeParse(id).success) notFound();
  const list = await loadShoppingList(getDb(), session.user.id, id, await getLocale());
  if (!list) notFound();
  return <ShoppingChecklist list={list} />;
}
