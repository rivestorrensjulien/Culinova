import { consentRecords, legalDocuments, users } from "@culinova/db/schema";
import { buttonClasses, Card, CardBody, CardDescription, CardTitle } from "@culinova/ui";
import { desc, eq } from "drizzle-orm";
import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";
import { DeleteAccountForm, ProfileForm } from "@/components/account/account-forms";
import { Link } from "@/i18n/navigation";
import { getDb } from "@/server/db";
import { requireUser } from "@/server/session";

export default async function AccountPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const session = await requireUser(locale);
  const t = await getTranslations("Account");
  const format = await getFormatter();
  const db = getDb();
  const [[user], consents] = await Promise.all([
    db
      .select({ name: users.name, email: users.email, createdAt: users.createdAt })
      .from(users)
      .where(eq(users.id, session.user.id)),
    db
      .select({
        id: consentRecords.id,
        title: legalDocuments.title,
        version: legalDocuments.version,
        at: consentRecords.at,
      })
      .from(consentRecords)
      .innerJoin(legalDocuments, eq(legalDocuments.id, consentRecords.legalDocumentId))
      .where(eq(consentRecords.userId, session.user.id))
      .orderBy(desc(consentRecords.at)),
  ]);
  if (!user) return null;
  const date = (d: Date) => format.dateTime(d, { dateStyle: "long" });

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <div>
        <h1 className="font-display text-4xl">{t("title")}</h1>
        <p className="mt-2 text-muted">{t("intro")}</p>
      </div>

      <Card>
        <CardBody className="flex flex-col gap-4">
          <div>
            <CardTitle>{t("profileTitle")}</CardTitle>
            <CardDescription>
              {t("email")} : <span className="font-medium text-foreground">{user.email}</span> ·{" "}
              {t("since", { date: date(user.createdAt) })}
            </CardDescription>
          </div>
          <ProfileForm name={user.name} />
        </CardBody>
      </Card>

      <Card>
        <CardBody className="flex flex-col items-start gap-2">
          <CardTitle>{t("securityTitle")}</CardTitle>
          <CardDescription>{t("securityText")}</CardDescription>
          <Link href="/app/compte/securite" className="font-medium text-primary hover:underline">
            {t("securityLink")}
          </Link>
        </CardBody>
      </Card>

      <Card>
        <CardBody className="flex flex-col gap-2">
          <CardTitle>{t("consentsTitle")}</CardTitle>
          {consents.length === 0 ? (
            <CardDescription>{t("consentsEmpty")}</CardDescription>
          ) : (
            <ul className="flex flex-col gap-1 text-sm text-muted" data-testid="consents">
              {consents.map((c) => (
                <li key={c.id}>
                  {t("consentItem", { title: c.title, version: c.version, date: date(c.at) })}
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardBody className="flex flex-col items-start gap-3">
          <CardTitle>{t("exportTitle")}</CardTitle>
          <CardDescription>{t("exportText")}</CardDescription>
          {session.impersonatedBy ? null : (
            <a href="/api/compte/export" download className={buttonClasses("secondary")}>
              {t("exportButton")}
            </a>
          )}
        </CardBody>
      </Card>

      <Card className="border-danger/40">
        <CardBody className="flex flex-col gap-3">
          <CardTitle>{t("deleteTitle")}</CardTitle>
          <CardDescription>{t("deleteText")}</CardDescription>
          <DeleteAccountForm email={user.email} />
        </CardBody>
      </Card>
    </div>
  );
}
