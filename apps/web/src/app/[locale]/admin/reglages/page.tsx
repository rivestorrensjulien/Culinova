import { Card, CardBody, CardDescription, CardTitle } from "@culinova/ui";
import { setRequestLocale } from "next-intl/server";
import { microsToInput } from "@/lib/admin-forms";
import { LEGAL_IDENTITY_FIELDS, missingLegalFields } from "@/lib/legal";
import { getDefaultQuotas } from "@/server/admin-settings";
import { getLegalIdentity } from "@/server/legal";
import { processingRegister } from "@culinova/db/schema";
import { getDb } from "@/server/db";
import { getAiBudgetCap, getAiSpend } from "@/server/quotas";
import { formatUsdMicros } from "../format";
import { Link } from "@/i18n/navigation";
import { AiBudgetForm, DefaultQuotasForm, LegalIdentityForm } from "./forms";

export default async function AdminSettingsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const db = getDb();
  const [defaults, cap, spent, identity] = await Promise.all([
    getDefaultQuotas(db),
    getAiBudgetCap(db),
    getAiSpend(db),
    getLegalIdentity(db),
  ]);
  const register = await db.select().from(processingRegister).orderBy(processingRegister.createdAt);
  const missing = missingLegalFields(identity).map(
    (key) => LEGAL_IDENTITY_FIELDS.find((f) => f.key === key)!.label,
  );

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="font-display text-4xl">Réglages</h1>
        <p className="mt-2 text-muted">
          Valeurs appliquées à tout le monde. Une personne peut avoir ses propres quotas depuis sa fiche
          (Utilisateurs). Les compteurs repartent à zéro le 1er de chaque mois.
        </p>
      </div>
      <Card>
        <CardBody className="flex flex-col gap-4">
          <div>
            <CardTitle>Quotas par défaut</CardTitle>
            <CardDescription>Les administrateurs ne sont pas limités.</CardDescription>
          </div>
          <DefaultQuotasForm values={defaults} />
        </CardBody>
      </Card>
      <Card>
        <CardBody className="flex flex-col gap-4">
          <div>
            <CardTitle>Budget IA</CardTitle>
            <CardDescription>
              Dépensé ce mois-ci : {formatUsdMicros(spent)}
              {cap === null ? "" : ` sur ${formatUsdMicros(cap)}`}.
            </CardDescription>
          </div>
          <AiBudgetForm value={microsToInput(cap)} />
        </CardBody>
      </Card>
      <Card>
        <CardBody className="flex flex-col gap-4">
          <div>
            <CardTitle>Informations légales</CardTitle>
            <CardDescription>
              Reprises dans les{" "}
              <Link href="/legal/mentions-legales" className="text-primary hover:underline">
                mentions légales
              </Link>
              , les CGU et la politique de confidentialité.{" "}
              {missing.length > 0
                ? `À compléter avant l’ouverture : ${missing.join(", ").toLowerCase()}.`
                : "Tout est renseigné."}
            </CardDescription>
          </div>
          <LegalIdentityForm values={identity} />
        </CardBody>
      </Card>
      <section className="flex flex-col gap-3">
        <div>
          <h2 className="font-display text-2xl">Registre des traitements (RGPD)</h2>
          <p className="text-sm text-muted">
            Tenu à jour avec l’application. À présenter en cas de contrôle de la CNIL.
          </p>
        </div>
        <ul className="flex flex-col divide-y divide-border rounded-lg border border-border bg-surface text-sm">
          {register.map((entry) => (
            <li key={entry.id} className="flex flex-col gap-1 px-4 py-3">
              <span className="font-medium">{entry.purpose}</span>
              <span className="text-muted">
                {entry.legalBasis} · données : {entry.dataCategories.join(", ")} · conservation :{" "}
                {entry.retention} · prestataires : {entry.processors.join(", ")}
              </span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
