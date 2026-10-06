# RÔLE
Tu es un architecte logiciel senior et un lead développeur full-stack. Tu vas concevoir et développer CULINOVA, une plateforme SaaS culinaire propulsée par l'IA, web et mobile (responsive + PWA), en français par défaut.

# VISION
CULINOVA — « De l'idée à l'assiette, avec l'IA. »
Ce n'est pas un simple générateur de recettes mais « le CMS intelligent de la cuisine » :
Créer → Structurer → Chiffrer → Illustrer → Gérer → Publier.
Cinq piliers : CRÉER, VISUALISER, CHIFFRER, GÉRER, COMMERCIALISER (SaaS avec essais, abonnements, paiements, résiliation).

# CIBLES
Principale : créateurs culinaires, cuisiniers/chefs indépendants, passionnés avancés.
Secondaires : particuliers, créateurs de contenu, traiteurs, restaurateurs.

# INSPIRATIONS (UX et principes, sans copier identité visuelle, code ni contenus)
## Inspiration 1 : GetCherry (getcherry.fr)
- Landing épurée, premium, orientée preuve visuelle : galerie de créations générées, parcours « 5 façons de travailler », formules claires, FAQ.
- Chiffrage au gramme près : coût matière total, par part, au kilo, marge, prix de vente conseillé HT/TTC.
- Prix fournisseurs : scan de factures (photo → lecture des lignes → mise à jour des prix, comparaison fournisseurs, alerte hausses et impact sur le coût des recettes). Toute modification de prix est soumise à validation de l'utilisateur.
- « Mes bases » : préparations de référence réutilisables dans plusieurs recettes, mises à jour partout d'un coup.
- Analyse d'une recette (équilibre, texture, cuisson) avec ajustements appliqués seulement si l'utilisateur valide.
- Import de recettes (photo, PDF, texte), fiches techniques imprimables/PDF.
- Mode préparation pas-à-pas avec minuteurs, dictée vocale, ajustement par discussion (« passe à 12 parts », « version sans gluten » → tout est recalculé).
- Photos pour réseaux sociaux (carré, portrait, vues en coupe).
- Essai gratuit 7 jours, rien prélevé avant la fin, 2 mois offerts en annuel, résiliation en un clic.
- Section « Lab » : articles/conseils (SEO + fidélisation).
## Inspiration 2 : FoodCraft (foodcraft.app/fr/recipes)
- Catalogue de recettes visuel, en cartes, avec recherche en langage naturel par IA (ex. « poulet rapide, dessert sans gluten »).
- Filtres en pastilles : type de plat, régimes (vegan, végétarien, sans gluten, sans lactose, halal, casher, keto…), temps (<15 / <30 / <1h), difficulté, cuisine du monde, calories.
- Chaque carte : photo, difficulté, temps, badge « Adaptable IA ».
- Pages catégories indexables (cuisines, régimes, temps…) pour le SEO.
- Raccourci de recherche (Ctrl+K), thème sombre élégant, blocs promotionnels intégrés dans la grille.
- Compteur de recettes, recettes qui s'adaptent au profil (allergies, préférences).

# ARCHITECTURE (principes non négociables)
Tout le périmètre ci-dessous est dans la version initiale : aucune refonte ne doit être nécessaire ensuite.
Séparation stricte : Utilisateurs → Abonnements → Recettes → Ingrédients → Prix → Calculs de coûts → Images → Génération IA → Facturation, sans duplication de données.
Principe central : Base ingrédients → prix actuel → recettes → coût recalculé automatiquement.
Valeurs internes standardisées (ex. grammes) pour tous les calculs ; la langue et les unités n'affectent que l'affichage, jamais les calculs.
Stack suggérée (adaptable, justifie ton choix) : Next.js + TypeScript, PostgreSQL (Supabase ou équivalent), Stripe (abonnements, webhooks, coupons, factures), service d'e-mails transactionnels, stockage objet pour images, API de LLM pour les recettes (sortie JSON structurée validée par schéma), API de génération d'images, file de tâches pour les générations longues.

# PARCOURS DE CRÉATION (cœur du produit, wizard simple et très visuel)
1. Moment de consommation : Entrée, Plat, Dessert, Street Food, Petit-déjeuner, Goûter, Mignardise sucrée, Mignardise salée.
2. Influence culinaire (facultative) : Aucune / zone large (Europe, Asie, Amériques, Afrique, Moyen-Orient, Méditerranée, Fusion, Internationale, Contemporaine).
3. Précision : région → pays → cuisine spécifique (4 niveaux de précision, au choix de l'utilisateur). Recherche, suggestions, récents, favoris.
4. Style culinaire : Inspiration légère / Influence marquée / Style traditionnel / Interprétation créative. Multi-sélection possible pour la fusion (ex. France + Japon) avec mention explicite « fusion / interprétation créative » (jamais présentée comme traditionnelle).
5. Langue de la recette (défaut = langue du compte, extensible).
6. Mode de création : à partir d'ingrédients / du nom d'une recette / d'une idée.
7. Saisie des ingrédients, du nom ou de l'idée (prendre en compte les quantités disponibles).
8. Nombre de personnes (défaut 4 ; 2/4/6/8/10/20/personnalisé), recalcul automatique de toutes les quantités.
9. Génération, avec possibilité de régénérer la recette, puis de régénérer l'image séparément.
10. Résultat : recette + photo HD + coût + dressage.
11. Génération du contenu social.
12. Sauvegarde automatique (aucune perte en cas de fermeture, rafraîchissement, coupure réseau).
Tous les paramètres (moment + influence + pays + cuisine + style + langue) sont transmis au moteur de recette, au moteur d'image et au moteur de contenu social : ce n'est pas un filtre cosmétique, ils participent à la construction de la recette (ingrédients, techniques, cuissons, épices, sauces, vocabulaire, dressage, ambiance de la photo).

# CONTENU D'UNE RECETTE
Nom, catégorie, nombre de personnes, temps de préparation/cuisson/total, difficulté, type de cuisine, saison, matériel, ingrédients, étapes, dressage, coût.
- Mise en place : pesée précise de chaque ingrédient en début de recette.
- Pas-à-pas : action, quantité, température, durée, matériel, ordre, résultat attendu (reproductible par un débutant).
- Dressage : assiette, positionnement, quantités, sauce, garniture, finition, décoration.
- Option : informations nutritionnelles, régimes/allergènes.

# IMAGES HD
- Photo culinaire photoréaliste, gourmande, professionnelle, cohérente avec catégorie, cuisine et dressage.
- Formats : 1:1, 4:5, 9:16, 16:9 ; régénération possible.
- Cohérence recette/photo : le prompt d'image est généré à partir des MÊMES données structurées que le dressage (aucun ingrédient absent, aucune présentation irréalisable).
- Texte éventuel sur l'image dans la langue choisie.

# INGRÉDIENTS, PRIX, COÛTS
- Base centrale d'ingrédients : nom, catégorie, prix/kg, unité de référence, fournisseur, date de mise à jour, historique des prix, allergènes, infos complémentaires.
- Historique des prix (date, ingrédient, ancien/nouveau prix) ; modification d'un prix = recalcul automatique de toutes les recettes concernées.
- Coût matière = Σ(quantité × prix) ; coût par portion = total ÷ portions.
- Prix de vente et marge dès la V1 : coefficient multiplicateur, prix conseillé HT/TTC, marge brute, taux de marge, taux de marque (paramétrables). Présentés comme outils d'aide à la gestion, pas comme garantie de prix optimal.
- Coût de main-d'œuvre (temps de préparation, cuisson surveillée, dressage, taux horaire) et coût énergétique (appareil, puissance, durée).
- Fiche technique professionnelle (référence, portions, grammages, coûts, temps, matériel, étapes, dressage, photo, prix de vente, marge) exportable en PDF.

# GESTION
- Mes recettes (cartes visuelles : photo, nom, catégorie, coût, temps, personnes), recherche et filtres (nom, ingrédient, catégorie, coût, temps, difficulté, date, favoris), recherche en langage naturel, raccourci Ctrl+K.
- Favoris ; modification d'une recette par instruction (« remplace le poulet par du poisson » → ingrédients, quantités, coût, étapes, dressage, photo réévalués).
- Versionnage des recettes avec retour à une version précédente.
- Versions linguistiques rattachées à la même recette (la version originale n'est jamais supprimée ; proposition de mise à jour des traductions quand la recette principale change). Traduction culinaire, pas littérale.
- Liste de courses (fusion des ingrédients de plusieurs recettes : 200 g + 300 g de farine = 500 g).
- Stocks (quantité, minimum, date, fournisseur, prix d'achat) et suggestion de recettes selon le stock.
- Menus (entrée/plat/dessert/boissons) avec ingrédients totaux, coût total, coût par personne, liste de courses.
- Export : PDF, impression, partage, téléchargement de la fiche et du visuel HD.
- Contenu réseaux sociaux : titre, description, texte court, légende Instagram, contenu TikTok, Pinterest, LinkedIn (aussi pour la promotion de l'app), hashtags, plusieurs formats ; langue du contenu social modifiable indépendamment de celle de la recette.

# BASE DES CUISINES (administrable)
Entités : régions, pays, cuisines, influences, styles, langues. Pour chaque cuisine : nom, pays, région, zone, description, ingrédients/techniques/épices caractéristiques, plats de référence, vocabulaire, langues, niveau de précision, statut actif/inactif. Liste extensible depuis l'admin.

# COMPTES, OFFRES, PAIEMENTS
Rôles : Administrateur principal (accès gratuit permanent), utilisateur gratuit/essai, abonné mensuel, abonné annuel. Offres extensibles : Free → Premium → Pro → Business (multi-utilisateurs, rôles, bibliothèque partagée).
- Offres, prix, quotas, fonctionnalités et durée d'essai entièrement configurables depuis l'admin, sans toucher au code.
- Quotas configurables par offre (recettes générées, images, régénérations, exports, recettes sauvegardées) ; crédits IA possibles.
- Codes promo / codes d'accès gratuits (durée, nombre d'utilisations, dates, offre associée, conversion possible ou non).
- Essai gratuit : avant activation, afficher durée, prix futur, fréquence, date de première facturation, renouvellement automatique, conditions de résiliation. Jamais de facturation surprise.
- Abonnement mensuel et annuel, l'annuel mis en avant (prix mensuel équivalent, prix annuel réel, économie, date de renouvellement) ; l'utilisateur sait toujours « combien je paie aujourd'hui » et « au prochain renouvellement ».
- Renouvellement automatique ; e-mail de rappel 7 jours avant le renouvellement annuel (délai paramétrable pour respecter le délai légal applicable selon l'offre et le pays), avec liens vers l'abonnement, le moyen de paiement et la résiliation.
- Résiliation en ligne en 1 clic : Mon compte → Mon abonnement → Résilier. Distinguer « arrêt du renouvellement » et « fin immédiate de l'accès » (par défaut l'accès reste actif jusqu'à la fin de la période payée ; message « Votre abonnement restera actif jusqu'au [DATE] »).
- Mes factures (date, montant, TVA, période, statut, référence, PDF).
- Échecs de paiement : notification, mise à jour du moyen de paiement, relances, période de grâce configurable, avertissement avant suspension.
- Stripe (ou équivalent) : paiements récurrents, remboursements, coupons, webhooks. Aucune donnée bancaire stockée en base.

# JURIDIQUE ET RGPD (accessible depuis toutes les pages importantes)
Mentions légales, CGU (dont contenus générés par IA), CGV (prix, durée, renouvellement, résiliation, remboursement, rétractation, conversion d'essai), politique de confidentialité, cookies (bandeau de consentement), politique d'abonnement, médiateur de la consommation.
Enregistrer à l'inscription et à la souscription : version CGU/CGV/confidentialité acceptée, date/heure, consentements spécifiques. L'utilisateur retrouve les documents de son contrat. Minimisation des données, suppression de compte, export des données, durées de conservation, registre des traitements. Les textes juridiques doivent être validés par un juriste avant mise en production.

# ADMINISTRATION
Connexion sécurisée (mot de passe hashé, récupération, 2FA recommandée, gestion/déconnexion de toutes les sessions, limitation des tentatives).
Tableau de bord : utilisateurs (total, nouveaux, actifs, gratuits, abonnés), abonnements (mensuels, annuels, essais, renouvellements, résiliations, échéances), revenus (CA, MRR, ARR, paiements, remboursements), usage (recettes et images générées, catégories populaires, recettes les plus vues).
Gestion : utilisateurs, abonnements, offres, codes gratuits, ingrédients et prix, recettes, cuisines, contenus (dont le Lab), visuels, paramètres IA, documents juridiques, paramètres généraux.
Notifications automatiques : bienvenue, confirmation d'inscription, activation/fin d'essai, paiement confirmé/refusé, renouvellement à venir/effectué, résiliation, changement d'offre.

# SÉCURITÉ
Sessions sécurisées, rôles et permissions, protection des API, protection contre les attaques courantes, rate limiting, sauvegardes, journalisation (AuditLogs).

# MODÈLE DE DONNÉES (minimum)
Users, Roles, Subscriptions, SubscriptionPlans, Payments, Invoices, TrialPeriods, PromoCodes, Recipes, RecipeVersions, RecipeTranslations, RecipeIngredients, RecipeSteps, RecipeImages, Ingredients, IngredientPrices, PriceHistory, Menus, ShoppingLists, Inventory, Favorites, Notifications, LegalDocuments, ConsentRecords, AuditLogs, CulinaryRegions, Countries, Cuisines, CulinaryInfluences, CulinaryStyles, Languages, BaseRecipes (« Mes bases »), Suppliers, SupplierInvoices.

# DESIGN
Premium, gastronomique, chaleureux, moderne, épuré, très visuel ; photos au centre de l'expérience ; mode clair/sombre ; parfait sur ordinateur, tablette et smartphone ; wizard fluide et simple malgré la richesse fonctionnelle. Identité originale (ne pas imiter Cherry ni FoodCraft).

# MÉTHODE DE TRAVAIL
1. Commence par proposer : l'architecture, le schéma de base de données complet, l'arborescence des pages et un plan de développement par jalons. Attends ma validation.
2. Ordre de réalisation suggéré : (a) fondations (auth, rôles, schéma, i18n) → (b) moteur de génération recette + wizard → (c) ingrédients, prix, coûts, marges → (d) images → (e) bibliothèque, versions, traductions → (f) abonnements, Stripe, juridique → (g) admin et statistiques → (h) listes de courses, stocks, menus, fiches techniques, exports, social → (i) landing page, Lab, SEO.
3. Code propre, typé, testé sur les calculs de coûts et la facturation, variables d'environnement pour les clés, aucune clé en dur.
4. À chaque jalon : explique ce qui est fait, comment le lancer et ce qui reste.