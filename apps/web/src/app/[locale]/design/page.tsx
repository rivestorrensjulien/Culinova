import { formatCents, materialCost, parsePrice, suggestPrice, toBase } from "@culinova/core";
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardDescription,
  CardTitle,
  Field,
  Input,
  Kbd,
  Separator,
  Skeleton,
  Spinner,
  Textarea,
  ThemeSwitcher,
} from "@culinova/ui";
import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Système de design",
};

const swatches = [
  { name: "Fond", token: "background", className: "bg-background" },
  { name: "Surface", token: "surface", className: "bg-surface" },
  { name: "Relief", token: "raised", className: "bg-raised" },
  { name: "Encre", token: "foreground", className: "bg-foreground" },
  { name: "Texte secondaire", token: "muted", className: "bg-muted" },
  { name: "Cuivre", token: "primary", className: "bg-primary" },
  { name: "Cuivre doux", token: "soft", className: "bg-soft" },
  { name: "Sauge", token: "sage", className: "bg-sage" },
  { name: "Or", token: "gold", className: "bg-gold" },
  { name: "Succès", token: "success", className: "bg-success" },
  { name: "Attention", token: "warning", className: "bg-warning" },
  { name: "Erreur", token: "danger", className: "bg-danger" },
];

/** Exemple de chiffrage calculé par @culinova/core (jamais saisi à la main). */
const demoCost = materialCost(
  [
    { quantity: toBase(800, "g"), price: { dimension: "mass", amount: parsePrice("2.80") } }, // potimarron
    { quantity: toBase(20, "cl"), price: { dimension: "volume", amount: parsePrice("4.80") } }, // crème
    { quantity: toBase(40, "g"), price: { dimension: "mass", amount: parsePrice("9.80") } }, // beurre
    { quantity: toBase(1, "piece"), price: { dimension: "count", amount: parsePrice("0.45") } }, // oignon
  ],
  4,
);
const demoPrice = suggestPrice(demoCost.perPortionCents, 3.5, 10);

const recipes = [
  {
    title: "Velouté de potimarron, noisettes torréfiées",
    category: "Entrée",
    time: "45 min",
    servings: 4,
    cost: demoCost.perPortionCents,
    photo:
      "radial-gradient(circle at 35% 40%, #f2a65a 0 22%, #d9772f 23% 38%, #7a3d18 39% 41%, #efe4d2 42% 100%)",
  },
  {
    title: "Tataki de thon, sésame et agrumes",
    category: "Plat",
    time: "25 min",
    servings: 2,
    cost: 690,
    photo: "radial-gradient(circle at 60% 45%, #b7323a 0 18%, #e8d7c0 19% 21%, #2a2522 22% 100%)",
  },
  {
    title: "Tartelette chocolat, fleur de sel",
    category: "Dessert",
    time: "1 h 30",
    servings: 8,
    cost: 142,
    photo: "radial-gradient(circle at 50% 50%, #3a2015 0 26%, #c99a5b 27% 33%, #f3eadb 34% 100%)",
  },
];

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-5">
      <div>
        <h2 className="font-display text-3xl">{title}</h2>
        {description ? <p className="mt-1 max-w-2xl text-muted">{description}</p> : null}
      </div>
      {children}
    </section>
  );
}

export default function DesignPage() {
  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-16 px-4 py-10 sm:px-8">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <Link href="/" className="text-xs font-medium tracking-[0.3em] text-primary uppercase">
          Culinova
        </Link>
        <ThemeSwitcher />
      </header>

      <div className="flex flex-col gap-4">
        <Badge tone="accent" className="self-start">
          Jalon J0 · Système de design
        </Badge>
        <h1 className="font-display text-5xl leading-[1.05] text-balance sm:text-6xl">
          Premium, gastronomique, chaleureux.
        </h1>
        <p className="max-w-2xl text-lg text-muted">
          Les fondations visuelles de Culinova : couleurs, typographie et composants, en thème clair comme en
          thème sombre. Les photos sont au centre de l&apos;expérience.
        </p>
      </div>

      <Section title="Couleurs" description="Chaque couleur est une variable CSS qui change avec le thème.">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {swatches.map((s) => (
            <div key={s.token} className="overflow-hidden rounded-md border border-border bg-surface">
              <div className={`h-16 ${s.className}`} />
              <div className="px-3 py-2">
                <p className="text-sm font-medium">{s.name}</p>
                <p className="font-mono text-xs text-muted">{s.token}</p>
              </div>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Typographie" description="Fraunces pour les titres, Inter pour le texte courant.">
        <Card>
          <CardBody className="flex flex-col gap-4">
            <p className="font-display text-6xl leading-none">Aa</p>
            <p className="font-display text-4xl">Titre de recette — Saint-Jacques snackées</p>
            <p className="font-display text-2xl text-muted italic">Beurre noisette, céleri et truffe</p>
            <p className="max-w-2xl">
              Faire mousser le beurre jusqu&apos;à coloration noisette, à 150 °C environ. Ajouter les noix de
              Saint-Jacques et saisir 90 secondes par face : le cœur doit rester nacré.
            </p>
            <p className="text-sm text-muted">Texte secondaire · 14 px · mentions, aides, métadonnées.</p>
          </CardBody>
        </Card>
      </Section>

      <Section title="Boutons">
        <div className="flex flex-wrap items-center gap-3">
          <Button>Générer la recette</Button>
          <Button variant="secondary">Régénérer l&apos;image</Button>
          <Button variant="ghost">Annuler</Button>
          <Button variant="danger">Révoquer l&apos;accès</Button>
          <Button disabled>Désactivé</Button>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button size="sm">Petit</Button>
          <Button size="md">Moyen</Button>
          <Button size="lg">Grand</Button>
          <Button variant="secondary">
            <Spinner /> Génération en cours
          </Button>
        </div>
      </Section>

      <Section title="Pastilles">
        <div className="flex flex-wrap gap-2">
          <Badge>Végétarien</Badge>
          <Badge tone="accent">Adaptable IA</Badge>
          <Badge tone="sage">De saison</Badge>
          <Badge tone="success">Actif</Badge>
          <Badge tone="warning">Quota bientôt atteint</Badge>
          <Badge tone="danger">Suspendu</Badge>
        </div>
      </Section>

      <Section
        title="Cartes de recettes"
        description="La photo occupe la place principale. Coût par portion calculé automatiquement."
      >
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {recipes.map((r) => (
            <Card key={r.title} className="group transition-shadow hover:shadow-lifted">
              <div
                role="img"
                aria-label={`Photo : ${r.title}`}
                className="aspect-[4/5] transition-transform duration-500 group-hover:scale-[1.02]"
                style={{ backgroundImage: r.photo }}
              />
              <CardBody>
                <div className="mb-2 flex items-center gap-2">
                  <Badge tone="accent">{r.category}</Badge>
                  <span className="text-xs text-muted">
                    {r.time} · {r.servings} pers.
                  </span>
                </div>
                <CardTitle>{r.title}</CardTitle>
                <CardDescription>{formatCents(r.cost)} par portion</CardDescription>
              </CardBody>
            </Card>
          ))}
        </div>
      </Section>

      <Section title="Chiffrage" description="Exemple calculé en direct par le paquet @culinova/core.">
        <Card className="max-w-xl">
          <CardBody className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
            <span className="text-muted">Coût matière total</span>
            <span className="text-right font-medium">{formatCents(demoCost.totalCents)}</span>
            <span className="text-muted">Coût par portion</span>
            <span className="text-right font-medium">{formatCents(demoCost.perPortionCents)}</span>
            <span className="text-muted">Prix conseillé HT (coef. 3,5)</span>
            <span className="text-right font-medium">{formatCents(demoPrice.priceExclTaxCents)}</span>
            <span className="text-muted">Prix conseillé TTC (TVA 10 %)</span>
            <span className="text-right font-medium">{formatCents(demoPrice.priceInclTaxCents)}</span>
            <Separator className="col-span-2" />
            <span className="text-muted">Taux de marque</span>
            <span className="text-right font-medium text-sage">
              {Math.round((demoPrice.margin.markupRate ?? 0) * 100)} %
            </span>
          </CardBody>
        </Card>
      </Section>

      <Section title="Formulaires">
        <Card className="max-w-xl">
          <CardBody className="flex flex-col gap-5">
            <Field label="Adresse e-mail" hint="Nous vous enverrons un lien de connexion valable 15 minutes.">
              {(a11y) => <Input type="email" placeholder="vous@exemple.fr" {...a11y} />}
            </Field>
            <Field label="Code d'invitation" error="Ce code n'est plus valide.">
              {(a11y) => <Input defaultValue="CULI-2026-XXXX" {...a11y} />}
            </Field>
            <Field label="Votre idée" hint="Ex. : un dessert d'automne autour de la poire et du sarrasin.">
              {(a11y) => <Textarea placeholder="Décrivez votre envie…" {...a11y} />}
            </Field>
            <div className="flex justify-end">
              <Button>Continuer</Button>
            </div>
          </CardBody>
        </Card>
      </Section>

      <Section title="Divers">
        <div className="flex flex-wrap items-center gap-6">
          <p className="flex items-center gap-2 text-sm text-muted">
            Recherche rapide <Kbd>Ctrl</Kbd> <Kbd>K</Kbd>
          </p>
          <div className="flex w-64 flex-col gap-2">
            <Skeleton className="h-32" />
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-4 w-1/2" />
          </div>
        </div>
      </Section>

      <footer className="border-t border-border pt-6 text-sm text-muted">
        Culinova · système de design v0 · {new Date().getFullYear()}
      </footer>
    </div>
  );
}
