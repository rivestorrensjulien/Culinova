import { Card, CardBody } from "@culinova/ui";
import type { ReactNode } from "react";
import { SiteFooter } from "./site-footer";
import { SiteHeader } from "./site-header";

/** Mise en page des écrans d'authentification (carte centrée). */
export function AuthShell({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader />
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-4 py-12">
        <h1 className="mb-6 font-display text-4xl leading-tight">{title}</h1>
        <Card>
          <CardBody className="flex flex-col gap-5">{children}</CardBody>
        </Card>
      </main>
      <SiteFooter />
    </div>
  );
}
