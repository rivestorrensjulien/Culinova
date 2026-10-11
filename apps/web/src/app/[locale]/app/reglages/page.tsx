import { getTranslations, setRequestLocale } from "next-intl/server";
import { getCostingSettings, listAppliances } from "@/server/costing/pricing";
import { getDb } from "@/server/db";
import { requireUser } from "@/server/session";
import { SettingsForm } from "./settings-form";

/** Réglages de chiffrage : valeurs par défaut utilisées pour toutes les recettes. */
export default async function SettingsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const session = await requireUser(locale);
  const t = await getTranslations("Settings");
  const db = getDb();
  const [settings, appliances] = await Promise.all([
    getCostingSettings(db, session.user.id),
    listAppliances(db, session.user.id),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 className="font-display text-4xl">{t("title")}</h1>
        <p className="max-w-3xl text-muted">{t("intro")}</p>
      </div>
      <SettingsForm settings={settings} appliances={appliances} />
    </div>
  );
}
