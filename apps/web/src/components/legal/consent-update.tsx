import { Card, CardBody } from "@culinova/ui";
import { getTranslations } from "next-intl/server";
import { SubmitButton } from "@/components/submit-button";
import { Link } from "@/i18n/navigation";
import { acceptConsentsAction } from "@/server/actions/legal";
import type { PendingDocument } from "@/server/legal";

const SLUGS: Record<string, string> = { cgu: "cgu", privacy: "confidentialite" };

/** Écran affiché tant que les nouvelles versions des documents n'ont pas été acceptées. */
export async function ConsentUpdate({ documents }: { documents: PendingDocument[] }) {
  const t = await getTranslations("Consent");
  return (
    <Card className="mx-auto max-w-xl" data-testid="consent-update">
      <CardBody className="flex flex-col gap-4">
        <h1 className="font-display text-3xl">{t("title")}</h1>
        <p className="text-muted">{t("intro")}</p>
        <ul className="flex list-disc flex-col gap-1 pl-5">
          {documents.map((doc) => (
            <li key={doc.id}>
              <Link
                href={`/legal/${SLUGS[doc.type] ?? doc.type}`}
                target="_blank"
                className="text-primary hover:underline"
              >
                {t("item", { title: doc.title, version: doc.version })}
              </Link>
            </li>
          ))}
        </ul>
        <form action={acceptConsentsAction} className="flex flex-col gap-4">
          {documents.map((doc) => (
            <input key={doc.id} type="hidden" name="document" value={doc.id} />
          ))}
          <label className="flex items-start gap-3 text-sm">
            <input type="checkbox" name="accept" required className="mt-0.5 size-4 accent-primary" />
            {t("accept")}
          </label>
          <div>
            <SubmitButton>{t("submit")}</SubmitButton>
          </div>
        </form>
        <p className="text-sm text-muted">
          <Link href="/app/compte" className="text-primary hover:underline">
            {t("refuse")}
          </Link>
        </p>
      </CardBody>
    </Card>
  );
}
