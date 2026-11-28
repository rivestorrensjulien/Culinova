# Culinova — récapitulatif du projet

*État au 28 novembre 2026. La version détaillée et technique est dans `CLAUDE.md` ; le besoin d'origine est dans `docs/cahier-des-charges.md`.*

## En une phrase

Culinova est une application culinaire propulsée par l'IA, en ligne sur **https://culinova.fr**.

Sa promesse : « Des recettes de chef, au gramme près, et ce qu'elles vous coûtent vraiment. »

- L'application est en français, avec l'anglais disponible.
- Elle s'utilise sur ordinateur et sur téléphone, et peut s'installer comme une application (PWA).
- La V1 est **gratuite et sur invitation**.

**Public :**
- **Cible principale : les particuliers** (décision du 11/11).
- Le mode **professionnel** reste disponible au choix dans « Mon compte ». Il deviendra une future offre Pro.
- L'**agent de publication sur les réseaux sociaux** est réservé à l'administrateur (Chef Ju).

---

## Ce qui est fait

### Jalons de la V1 : tous terminés sauf J9

| Jalon | Ce que ça apporte |
|---|---|
| **J0 · Socle** | Code organisé, tests automatiques à chaque envoi sur GitHub, système de design clair / sombre |
| **J1 · Accès sur invitation** | Connexion par lien magique (sans mot de passe), double sécurité pour l'admin, codes d'invitation révocables, quotas, journal d'audit |
| **J2 · Moteur de recettes** | Assistant de création, recettes rédigées par Claude, coût de l'IA mesuré |
| **J3 · Prix, coûts, marges** | « Mes prix » (estimés par l'IA si absents), coût matière, prix de vente et marges, main-d'œuvre, énergie, HT/TTC, bases faites maison, valeurs nutritionnelles (table Ciqual de l'ANSES) |
| **J4 · Photos** | Photo réaliste du plat générée d'après le dressage, en 4 formats (carré, 4:5, 9:16, 16:9) |
| **J5 · Bibliothèque** | Recherche en langage courant, filtres, favoris, Ctrl+K, versions, modification par simple instruction, traduction FR ↔ EN |
| **J6 · Admin et juridique** | Réglages, fiche de chaque utilisateur, « se connecter en tant que », mentions légales, CGU, confidentialité, export et suppression du compte |
| **J7 · Outils pro** | Fiche technique imprimable, mode préparation avec minuteurs, menus, listes de courses, stocks, import de recettes, scan de factures |
| **J8 · Accueil et PWA** | Page d'accueil avec démonstration, demandes d'invitation, application installable |
| **J9 · Agent de publication** | En cours (voir plus bas) |

### Spécial particuliers (P1 à P8, terminés)

1. **Mode particulier par défaut.** Interface simplifiée ; le mode pro reste au choix.
2. **Assistant court** en trois questions :
   - qu'est-ce qu'on cuisine ;
   - pour combien, avec quel budget et quel temps ;
   - votre niveau et vos appareils.
3. **Mesures de cuisine à côté des grammes**, par exemple « 100 g (2 œufs) » ou « 5 g (1 c. à café) ».
4. **Liste de courses et garde-manger.** Ce qu'on a déjà est déduit, avec un bouton « J'en ai déjà ».
5. **Mobile d'abord.** Menu replié et barre d'onglets en bas de l'écran, testés sur un écran de 380 px.
6. **Badge « Relue par Chef Ju »**, astuces de chef sur chaque recette et « La sélection de Chef Ju ».
7. **Recette d'essai sans inscription** (`/essai`), récupérable dans son compte après invitation.
8. **Scan de tickets de caisse** (la photo n'est jamais gardée) et **prix de référence** partagés entre particuliers.

### Agent de publication (J9, administrateur seulement)

- **Mascotte « Chef Ju »**, version chibi de Julien.
- **Formats** : vidéos 9:16 avec la mascotte, carrousels de photos.
- **Réseaux** :
  - Instagram : Reel, photo et carrousel ;
  - TikTok ;
  - Pinterest : accès Standard obtenu le 30/10.
- **Publication** : seulement après validation, avec programmation aux meilleurs créneaux et planification automatique d'une semaine.
- **« Commente RECETTE »** : le lien de la recette est envoyé en message privé Instagram.
- **Suivi** : pages publiques des recettes (`culinova.fr/recette/…`, sans les prix), statistiques et analyse par l'IA, provenance des demandes d'invitation.
- **Reste à faire** :
  - attendre la validation de l'audit TikTok, soumis à nouveau le 02/11 ;
  - passer ensuite aux clés de production TikTok, rendre le compte public, puis cliquer sur « Relier à nouveau ».

---

## Services utilisés

Aucune clé secrète n'est écrite ici. Elles sont rangées dans le gestionnaire de mots de passe de Julien et dans les variables d'environnement de Vercel.

| Service | Rôle |
|---|---|
| **GitHub** (`rivestorrensjulien/Culinova`) | Code source, tests automatiques, tâches programmées (vidéos, Ciqual) |
| **Vercel** | Hébergement ; chaque envoi sur `main` met le site à jour |
| **Supabase** (UE, Irlande) | Base de données et stockage des photos et vidéos |
| **Resend** | E-mails (expéditeur `bonjour@culinova.fr`) |
| **Anthropic** (Claude Sonnet 5.5) | Rédaction des recettes et analyses, avec une limite de dépense mensuelle |
| **fal.ai** | Photos (FLUX.2 [pro]) et images ou clips des vidéos |
| **OVH** | Nom de domaine culinova.fr et boîtes e-mail |
| **Meta, TikTok, Pinterest** | Applications développeur reliées à l'agent de publication |

### Bon à savoir pour la mise en ligne
- Avant chaque mise en ligne, Vercel met la base à jour tout seul. Le journal affiche « ✓ Tables à jour ».
- Après avoir modifié une variable sur Vercel, il faut cliquer sur **Redeploy**.
- L'adresse Supabase se copie avec le bouton de copie : un affichage raccourci « … » la casse.

---

## Documents utiles

- `CLAUDE.md` : toutes les décisions et le détail technique, tenus à jour à chaque étape.
- `docs/cahier-des-charges.md` : le cahier des charges d'origine.
- `docs/agent-publication.md` : le mode d'emploi de l'agent de publication.
- Proposition d'architecture : https://claude.ai/code/artifact/91f8d5b4-0ee3-49a5-a3ec-ad89f1550914
