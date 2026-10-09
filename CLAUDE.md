# CULINOVA — contexte du projet

Plateforme culinaire propulsée par l'IA (web + PWA), en français par défaut.
Cahier des charges complet : `docs/cahier-des-charges.md`.
Proposition d'architecture validée (document partagé) : https://claude.ai/code/artifact/91f8d5b4-0ee3-49a5-a3ec-ad89f1550914

Langue de travail avec le porteur du projet (Julien) : **français**. Il n'est pas développeur : expliquer simplement, étape par étape.

## Décisions validées

- **V1 gratuite, sur invitation uniquement.** Un code individuel par personne, révocable à tout moment par l'admin (révocation = compte suspendu + toutes les sessions fermées, données conservées, réactivation possible).
- **Pas de vente en V1.** Stripe, offres payantes, essais, CGV, médiateur, revenus (MRR/ARR), catalogue public, Lab et SEO = **phase 2**, ajoutés sans refonte.
- **Quotas par défaut** (modifiables depuis l'admin, globalement ou par personne) : 5 recettes générées / mois, 2 régénérations de texte par recette, 10 images / mois, plafond de budget IA mensuel global. Remise à zéro le 1er du mois. Les 4 formats d'image sont recadrés depuis une image HD (pas de génération supplémentaire).
- **Connexion par lien magique** envoyé par e-mail (valable 15 min, usage unique), sans mot de passe. Les administrateurs ont en plus un second facteur (TOTP).
- **Admin** : liste des utilisateurs (e-mail, code, inscription, dernière connexion, consommation, coût IA, statut), suspendre / réactiver, fermer les sessions, renvoyer un lien, ajuster les quotas, « se connecter en tant que » (tracé dans le journal d'audit).
- **Nutrition** : table Ciqual (ANSES) en priorité, USDA FoodData Central en complément.
- **Images** : FLUX1.1 [pro] via fal.ai derrière un adaptateur interchangeable.
- **LLM** : API Claude (Sonnet 5.5 pour les recettes), sorties JSON validées par schémas Zod.

## Stack

Monorepo pnpm + Turborepo. Next.js (App Router) + TypeScript strict, PostgreSQL (Supabase, région UE), Drizzle ORM, Better Auth (lien magique + 2FA admin), Inngest (tâches longues), Supabase Storage, Resend + React Email, next-intl, Serwist (PWA), Upstash Redis (rate limiting), Sentry, Vitest + Playwright. Hébergement Vercel.

```
apps/web            Next.js : site public, /app, /admin, API
packages/core       Logique pure : unités, conversions, portions, coûts, marges, listes de courses
packages/db         Schéma Drizzle, migrations, seeds
packages/ai         Prompts versionnés, schémas Zod, adaptateurs LLM et image
packages/jobs       Tâches Inngest
packages/emails     Gabarits d'e-mails
packages/ui         Système de design (clair / sombre)
```

## Règles non négociables

- Unités internes : grammes, millilitres, °C, secondes, centimes (`*_cents` entiers), prix au kilo en euros, `numeric(12,4)` (ex. `9.8000` = 9,80 €/kg). La langue et les unités n'affectent que l'affichage.
- Le coût n'est jamais saisi : il est calculé (coût matière = Σ quantité × prix). Le seul coût stocké est un cache horodaté, invalidé à chaque changement de prix.
- L'IA propose, l'utilisateur valide (prix, analyses, traductions).
- Rédaction des recettes (retours de Julien, prompts `recipe.generate@2` puis `@3`) : vocabulaire utilisé en France (« biscuits boudoirs », pas « savoiardi ») ; temps de cuisson seulement pour ce qui est réellement chauffé ; quantités des étapes écrites en jetons `{{i3}}` / `{{i3:50}}`, recalculées au nombre de personnes ; dressage raconté en une ou deux phrases (`plating.description`) ; matériel identique dans la liste, les étapes et le dressage (« assiette » réservé au service).
- Liste « Ingrédients » (et non « Mise en place ») : liste simple nom + quantité, sans groupes ni précisions. Tout est pesé en grammes (prompt `recipe.generate@3`, `unit = "g"`), suivi entre parenthèses de la mesure parlante (`displayQuantity`/`displayUnit` : œufs, pincée, c. à soupe, cl).
- Affichage du pas à pas : numéro, consigne et résultat attendu uniquement (pas d'intitulé de phase ni de pastilles). Les données (durées, minuteurs, matériel par étape) restent enregistrées pour le futur mode préparation.
- Aucune clé en dur : tout passe par des variables d'environnement (`.env.example` documenté).
- Calculs de coûts et quotas couverts par des tests unitaires.
- Identité visuelle originale : premium, gastronomique, chaleureuse, épurée, photos au centre. Ne pas imiter GetCherry ni FoodCraft.

## Jalons (V1)

- [x] **J0 · Socle technique** : monorepo, CI GitHub Actions (lint, types, tests, build), `.env.example`, système de design (thèmes clair et sombre, typographie, composants de base), page vitrine du design.
- [x] **J1 · Fondations et accès sur invitation** : schéma V1, seeds, auth lien magique + 2FA admin, rôles, codes d'invitation et révocation, compteurs de quotas, i18n, journal d'audit, consentements.
- [x] **J2 · Moteur de recette et wizard** (12 étapes, sauvegarde auto, quotas appliqués, coût IA mesuré).
- [ ] **J3 · Ingrédients, prix, coûts, marges** (Mes bases, main-d'œuvre, énergie, HT/TTC, nutrition).
- [ ] **J4 · Images** (prompt dérivé du dressage, 4 formats recadrés).
- [ ] **J5 · Bibliothèque, versions, traductions** (Ctrl+K, modification par instruction).
- [ ] **J6 · Administration et juridique** (mentions légales, CGU, confidentialité, cookies, export / suppression du compte).
- [ ] **J7 · Outils pro** (courses, stocks, menus, fiche technique PDF, mode préparation, import, scan de factures, contenu social).
- [ ] **J8 · Page d'accueil (demande d'invitation) et PWA.**

À la fin de chaque jalon : expliquer ce qui est fait, comment le lancer, ce qui reste ; cocher la case ci-dessus.

## Conventions git

- Branche principale : `main`. Messages de commit en français, à l'impératif.
