import { Card, CardBody, CardDescription, CardTitle } from "@culinova/ui";
import Image from "next/image";
import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";
import { formatDuration } from "@/components/recipe/format";
import { Link } from "@/i18n/navigation";
import { getDb } from "@/server/db";
import { listBases } from "@/server/generation/view";
import { requireUser } from "@/server/session";

/** « Mes bases » : préparations faites maison, réutilisables dans les recettes. */
export default async function BasesPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const session = await requireUser(locale);
  const t = await getTranslations("Bases");
  const format = await getFormatter();
  const bases = await listBases(getDb(), session.user.id);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 className="font-display text-4xl">{t("title")}</h1>
        <p className="max-w-3xl text-muted">{t("intro")}</p>
      </div>
      {bases.length === 0 ? (
        <p className="text-muted">{t("empty")}</p>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" data-testid="bases">
          {bases.map((base) => (
            <li key={base.id}>
              <Card className="h-full overflow-hidden">
                <Link
                  href={`/app/recettes/${base.id}`}
                  className="relative block aspect-[4/3] bg-soft"
                  tabIndex={-1}
                >
                  {base.imageId ? (
                    <Image
                      src={`/api/images/${base.imageId}`}
                      alt=""
                      fill
                      unoptimized
                      sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
                      className="object-cover"
                      data-testid="base-photo"
                    />
                  ) : (
                    <span className="absolute inset-0 flex items-center justify-center font-display text-5xl text-soft-foreground/60">
                      {base.name.charAt(0)}
                    </span>
                  )}
                </Link>
                <CardBody className="flex flex-col gap-2">
                  <CardTitle>
                    <Link href={`/app/recettes/${base.id}`} className="hover:underline">
                      {base.name}
                    </Link>
                  </CardTitle>
                  <CardDescription>
                    {[
                      `${t("yield", { grams: format.number(base.yieldG) })}${
                        base.yieldDisplayQuantity && base.yieldDisplayUnit
                          ? ` (${format.number(base.yieldDisplayQuantity)} ${base.yieldDisplayUnit})`
                          : ""
                      }`,
                      formatDuration((base.prepS ?? 0) + (base.cookS ?? 0) + (base.restS ?? 0)),
                    ].join(" · ")}
                  </CardDescription>
                  <p className="text-xs text-muted">
                    {base.usedIn.length > 0
                      ? t("usedIn", { names: base.usedIn.map((u) => u.name).join(", ") })
                      : t("notUsed")}
                  </p>
                </CardBody>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
