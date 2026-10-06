import { sessions } from "@culinova/db/schema";
import { Button, Card, CardBody, Badge } from "@culinova/ui";
import { desc, eq } from "drizzle-orm";
import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";
import { signOutEverywhereAction } from "@/server/actions/auth";
import { getDb } from "@/server/db";
import { requireUser } from "@/server/session";

/** Résumé lisible d'un « user agent » (navigateur · système). */
function describeDevice(userAgent: string | null): string | null {
  if (!userAgent) return null;
  const browser = /Edg\//.test(userAgent)
    ? "Edge"
    : /Firefox\//.test(userAgent)
      ? "Firefox"
      : /Chrome\//.test(userAgent)
        ? "Chrome"
        : /Safari\//.test(userAgent)
          ? "Safari"
          : null;
  const os = /iPhone|iPad/.test(userAgent)
    ? "iOS"
    : /Android/.test(userAgent)
      ? "Android"
      : /Mac OS X/.test(userAgent)
        ? "macOS"
        : /Windows/.test(userAgent)
          ? "Windows"
          : /Linux/.test(userAgent)
            ? "Linux"
            : null;
  return [browser, os].filter(Boolean).join(" · ") || null;
}

export default async function SecurityPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const session = await requireUser(locale);
  const t = await getTranslations("Security");
  const format = await getFormatter();
  const rows = await getDb()
    .select()
    .from(sessions)
    .where(eq(sessions.userId, session.user.id))
    .orderBy(desc(sessions.createdAt));

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <div>
        <h1 className="font-display text-4xl">{t("title")}</h1>
        <p className="mt-2 text-muted">{t("intro")}</p>
      </div>
      <ul className="flex flex-col gap-3">
        {rows.map((row) => (
          <li key={row.id}>
            <Card>
              <CardBody className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="font-medium">{describeDevice(row.userAgent) ?? t("unknownDevice")}</p>
                  <p className="text-sm text-muted">
                    {t("since", {
                      date: format.dateTime(row.createdAt, { dateStyle: "long", timeStyle: "short" }),
                    })}
                    {row.ipAddress ? ` · ${row.ipAddress}` : ""}
                  </p>
                </div>
                {row.id === session.sessionId ? <Badge tone="accent">{t("current")}</Badge> : null}
              </CardBody>
            </Card>
          </li>
        ))}
      </ul>
      <form action={signOutEverywhereAction} className="flex flex-col items-start gap-2">
        <Button type="submit" variant="danger">
          {t("signOutEverywhere")}
        </Button>
        <p className="text-sm text-muted">{t("signOutEverywhereHint")}</p>
      </form>
    </div>
  );
}
