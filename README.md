# Culinova

« De l'idée à l'assiette, avec l'IA. » — plateforme culinaire (web + PWA), en français par défaut.

Contexte et décisions : [`CLAUDE.md`](CLAUDE.md) · Cahier des charges : [`docs/cahier-des-charges.md`](docs/cahier-des-charges.md)

## Prérequis

- Node.js 22 (voir `.nvmrc`)
- pnpm 10 : `corepack enable` (la version exacte est fixée dans `package.json`)
- PostgreSQL 16 : en local, ou un projet Supabase (région UE)

## Premier lancement

```bash
pnpm install                 # installe toutes les dépendances
cp .env.example .env         # puis remplir DATABASE_URL, BETTER_AUTH_SECRET, ADMIN_EMAIL
pnpm db:migrate              # crée les tables
pnpm db:seed                 # données de référence + compte administrateur (ADMIN_EMAIL)
pnpm dev                     # http://localhost:3000
```

Sans clé Claude (`ANTHROPIC_API_KEY`), une IA « factice » génère une recette d'exemple :
tout le parcours fonctionne, sans coût. Avec la clé, `pnpm ai:essai "votre idée"` lance une
vraie génération et affiche son coût.

Sans clé Resend, les e-mails ne partent pas : le lien de connexion s'affiche dans le
terminal et est enregistré dans `apps/web/.outbox/`.

### Se connecter en administrateur

1. Ouvrir http://localhost:3000/connexion et saisir l'adresse `ADMIN_EMAIL`.
2. Ouvrir le lien affiché dans le terminal, cliquer sur « Me connecter ».
3. Aller sur http://localhost:3000/admin : la première fois, scanner le QR code avec une
   application d'authentification, saisir le code, **noter les codes de secours**.
4. Créer un code dans **Invitations**, l'envoyer à la personne invitée.

### Pages principales

| Adresse                | Rôle                                                     |
| ---------------------- | -------------------------------------------------------- |
| `/connexion`           | Connexion par lien magique (15 min, usage unique)        |
| `/invitation/[code]`   | Création du compte avec un code (CGU + confidentialité)  |
| `/app`                 | Espace connecté : solde du mois                          |
| `/app/creer`           | Wizard de création en 12 étapes (sauvegarde automatique) |
| `/app/recettes`        | Mes recettes, et chaque recette avec ses versions        |
| `/app/compte/securite` | Appareils connectés, déconnexion partout                 |
| `/2fa`                 | Second facteur des administrateurs                       |
| `/admin`               | Tableau de bord, utilisateurs, invitations, journal      |
| `/legal/cgu`           | Documents juridiques (versions provisoires)              |
| `/design`              | Vitrine du système de design                             |
| `/en/...`              | Version anglaise de chaque page                          |

## Commandes

| Commande           | Rôle                                                          |
| ------------------ | ------------------------------------------------------------- |
| `pnpm dev`         | Serveur de développement                                      |
| `pnpm build`       | Build de production                                           |
| `pnpm lint`        | Analyse du code (ESLint)                                      |
| `pnpm typecheck`   | Vérification des types (TypeScript strict)                    |
| `pnpm test`        | Tests unitaires et d'intégration (Vitest)                     |
| `pnpm test:e2e`    | Tests de bout en bout dans un navigateur (après `pnpm build`) |
| `pnpm check`       | Lint, types, tests et build d'un coup                         |
| `pnpm db:generate` | Génère une migration après modification du schéma             |
| `pnpm db:migrate`  | Applique les migrations                                       |
| `pnpm db:seed`     | Données de référence (relançable sans doublons)               |
| `pnpm ai:essai`    | Une vraie génération avec Claude (nécessite la clé)           |
| `pnpm format`      | Formate le code (Prettier)                                    |

Les tests d'intégration et de bout en bout utilisent des bases dédiées
(`DATABASE_URL_TEST`, `DATABASE_URL_E2E`), **vidées à chaque lancement** : leur nom doit
contenir « test ». Sans `DATABASE_URL_TEST`, les tests d'intégration sont ignorés.

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
Coûts d'IA en micro-dollars (1 $ = 1 000 000), car facturés en dollars par fractions de centime.
Prix au kilo / au litre / à la pièce stockés en `numeric(12,4)` **exprimés en euros**
(« 9.8000 » = 9,80 €/kg). Les calculs intermédiaires sont exacts (entiers) et
l'arrondi au centime n'a lieu qu'à la fin.
