# Culinova

« De l'idée à l'assiette, avec l'IA. » — plateforme culinaire (web + PWA), en français par défaut.

Contexte et décisions : [`CLAUDE.md`](CLAUDE.md) · Cahier des charges : [`docs/cahier-des-charges.md`](docs/cahier-des-charges.md)

## Prérequis

- Node.js 22 (voir `.nvmrc`)
- pnpm 10 : `corepack enable` (la version exacte est fixée dans `package.json`)

## Démarrer

```bash
pnpm install          # installe toutes les dépendances du monorepo
cp .env.example .env  # facultatif au jalon J0
pnpm dev              # lance le site sur http://localhost:3000
```

- Page d'accueil provisoire : http://localhost:3000
- Vitrine du système de design (clair / sombre) : http://localhost:3000/design

## Commandes

| Commande         | Rôle                                       |
| ---------------- | ------------------------------------------ |
| `pnpm dev`       | Serveur de développement                   |
| `pnpm build`     | Build de production                        |
| `pnpm lint`      | Analyse du code (ESLint)                   |
| `pnpm typecheck` | Vérification des types (TypeScript strict) |
| `pnpm test`      | Tests unitaires (Vitest)                   |
| `pnpm check`     | Tout ce que vérifie la CI, d'un coup       |
| `pnpm format`    | Formate le code (Prettier)                 |

Couverture des calculs : `pnpm --filter @culinova/core test:coverage`.

## Organisation

```
apps/web            Next.js (App Router) : site public, /app, /admin, API
packages/core       Logique pure : unités, conversions, portions, coûts, marges, listes de courses
packages/db         Schéma Drizzle, migrations, seeds
packages/ai         Prompts, schémas Zod, adaptateurs LLM et image
packages/jobs       Tâches longues (Inngest)
packages/emails     Gabarits d'e-mails (React Email)
packages/ui         Système de design (thèmes clair et sombre)
```

## Règles de calcul

Unités internes : grammes, millilitres, pièces, °C, secondes. Montants en centimes entiers.
Prix au kilo / au litre / à la pièce stockés en `numeric(12,4)` **exprimés en centimes**
(« 1234.5678 » = 12,345678 €/kg). Les calculs intermédiaires sont exacts (entiers) et
l'arrondi au centime n'a lieu qu'à la fin.
