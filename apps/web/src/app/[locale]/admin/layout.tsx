import { Badge, Button } from "@culinova/ui";
import { setRequestLocale } from "next-intl/server";
import type { ReactNode } from "react";
import { SiteHeader } from "@/components/site-header";
import { Link } from "@/i18n/navigation";
import { pendingRequestCount } from "@/server/access/requests";
import { signOutAction } from "@/server/actions/auth";
import { getDb } from "@/server/db";
import { requireAdmin } from "@/server/session";

export const dynamic = "force-dynamic";

const NAV = [
  { href: "/admin", label: "Tableau de bord" },
  { href: "/admin/utilisateurs", label: "Utilisateurs" },
  { href: "/admin/demandes", label: "Demandes" },
  { href: "/admin/invitations", label: "Invitations" },
  { href: "/admin/journal", label: "Journal" },
  { href: "/admin/reglages", label: "Réglages" },
] as const;

/** Administration : rôle administrateur + second facteur validé pour la session. */
export default async function AdminLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requireAdmin(locale);
  const pending = await pendingRequestCount(getDb());
  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader homeHref="/admin">
        <Badge tone="sage">Administration</Badge>
        <nav className="flex flex-wrap items-center gap-1 text-sm">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 hover:bg-raised"
            >
              {item.label}
              {item.href === "/admin/demandes" && pending > 0 ? (
                <span
                  className="rounded-full bg-primary px-1.5 text-xs leading-5 text-primary-foreground"
                  data-testid="pending-requests"
                >
                  {pending}
                </span>
              ) : null}
            </Link>
          ))}
          <Link href="/app" className="rounded-full px-3 py-1.5 text-muted hover:bg-raised">
            Mon espace
          </Link>
        </nav>
        <form action={signOutAction}>
          <Button type="submit" variant="ghost" size="sm">
            Se déconnecter
          </Button>
        </form>
      </SiteHeader>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-10 sm:px-8">{children}</main>
    </div>
  );
}
