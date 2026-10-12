/**
 * Documents juridiques de la V1 (gratuite, sur invitation). Publiés par le seed :
 * une version plus récente que celle en vigueur la remplace, et les personnes
 * ayant accepté l'ancienne version des CGU ou de la politique de confidentialité
 * sont invitées à accepter la nouvelle à leur prochaine visite.
 *
 * Les champs {{editeur.…}} sont remplis à l'affichage avec les informations
 * saisies dans l'administration (Réglages → Informations légales).
 * Textes à faire relire par un juriste avant l'ouverture au public.
 */
export const LEGAL_DOCUMENTS = [
  {
    type: "legal_notice" as const,
    version: "1.0",
    title: "Mentions légales",
    bodyMd: `## Éditeur du site
Le site Culinova est édité par **{{editeur.nom}}**, {{editeur.forme}}.

- Adresse : {{editeur.adresse}}
- SIRET : {{editeur.siret}}
- TVA intracommunautaire : {{editeur.tva}}
- Contact : {{editeur.email}}

Directeur·rice de la publication : {{editeur.directeur}}.

## Hébergement
- Application : **Vercel Inc.**, 440 N Barranca Ave #4133, Covina, CA 91723, États-Unis — vercel.com. Les pages sont servies depuis la région de Dublin (Irlande).
- Base de données et fichiers : **Supabase Inc.** — supabase.com, hébergement dans l'Union européenne.

## Propriété intellectuelle
La marque Culinova, l'identité visuelle, les textes et le code du site sont protégés. Toute reproduction sans autorisation est interdite.

Les recettes, images et textes que vous créez avec Culinova vous appartiennent, dans la limite des droits que la loi reconnaît aux contenus produits avec l'aide d'une intelligence artificielle (voir les conditions générales d'utilisation).

## Signaler un contenu
Pour signaler un contenu ou un problème : {{editeur.email}}.`,
  },
  {
    type: "cgu" as const,
    version: "1.0",
    title: "Conditions générales d'utilisation",
    bodyMd: `## 1. Objet
Culinova est une plateforme culinaire qui aide à créer, chiffrer et présenter des recettes grâce à l'intelligence artificielle. Les présentes conditions (« CGU ») encadrent l'utilisation du service édité par {{editeur.nom}} (voir les mentions légales). Créer un compte vaut acceptation des CGU.

## 2. Accès sur invitation
- Pendant cette phase, l'accès est **gratuit** et réservé aux personnes **invitées** au moyen d'un code individuel et personnel.
- Le code et le compte ne peuvent être ni prêtés, ni cédés, ni partagés.
- La connexion se fait par un lien envoyé par e-mail, valable 15 minutes et utilisable une seule fois : gardez votre messagerie sécurisée.
- L'éditeur peut **suspendre ou révoquer** un accès à tout moment, notamment en cas d'usage contraire aux présentes CGU. Une suspension ferme toutes les sessions ; les données sont conservées et le compte peut être réactivé.

## 3. Quotas
L'utilisation est limitée par des quotas mensuels (recettes générées, images, régénérations par recette), affichés dans votre espace et remis à zéro le 1er de chaque mois. L'éditeur peut les ajuster. Un plafond global de dépenses d'intelligence artificielle peut suspendre temporairement les générations jusqu'au mois suivant.

## 4. Contenus générés par l'intelligence artificielle
Recettes, textes, traductions, images, estimations de prix et valeurs nutritionnelles sont proposés par des modèles d'intelligence artificielle. **Ils peuvent contenir des erreurs.** Avant toute utilisation, vérifiez notamment :
- les **allergènes** et la compatibilité avec un régime ou un état de santé ;
- les **cuissons**, températures et règles d'hygiène ;
- les **quantités**, coûts, prix de vente et valeurs nutritionnelles, qui sont des aides à la décision et non des garanties.

Les valeurs nutritionnelles s'appuient sur la table Ciqual de l'ANSES et, en complément, sur la base FoodData Central (USDA) ; elles restent des estimations.

## 5. Vos contenus
Vous restez maître des recettes, prix, réglages et images que vous créez. Vous pouvez les utiliser librement, y compris à titre professionnel. Vous accordez à l'éditeur le seul droit de les héberger et de les traiter pour vous fournir le service. Ils ne sont ni publiés, ni revendus, ni utilisés pour entraîner des modèles d'intelligence artificielle.

Vous vous engagez à ne pas utiliser le service pour produire des contenus illicites, trompeurs ou portant atteinte aux droits d'autrui (marques, photographies, recettes protégées).

## 6. Disponibilité
Le service est fourni tel quel, sans garantie de disponibilité continue. Des interruptions peuvent avoir lieu pour maintenance ou en cas d'indisponibilité d'un prestataire. L'éditeur ne saurait être tenu responsable des dommages indirects liés à l'utilisation du service ou des contenus générés.

## 7. Fin de l'utilisation
Vous pouvez **exporter vos données** et **supprimer votre compte** à tout moment depuis « Mon compte ». La suppression est définitive.

## 8. Évolution des conditions
Les CGU peuvent évoluer. En cas de changement, la nouvelle version vous est présentée à votre prochaine visite et doit être acceptée pour continuer à utiliser le service.

## 9. Droit applicable
Les présentes CGU sont soumises au droit français. En cas de litige, une solution amiable est recherchée en priorité ({{editeur.email}}) ; à défaut, les tribunaux français sont compétents.`,
  },
  {
    type: "privacy" as const,
    version: "1.0",
    title: "Politique de confidentialité",
    bodyMd: `## Responsable du traitement
{{editeur.nom}}, {{editeur.adresse}} — {{editeur.email}}.

## Données traitées
- **Compte** : adresse e-mail, nom (facultatif), langue, code d'invitation utilisé, rôle.
- **Sécurité** : dates de connexion, sessions ouvertes, adresse IP et navigateur, journal des actions sensibles.
- **Contenus** : paramètres de création, recettes et leurs versions, traductions, photos, ingrédients, prix, fournisseurs, réglages de prix de vente, correspondances nutritionnelles, favoris.
- **Utilisation** : consommation des quotas et coût des générations par intelligence artificielle.
- **Consentements** : versions des documents acceptés, date, adresse IP et navigateur.

Aucune donnée de paiement n'est collectée pendant la phase sur invitation.

## Finalités et bases légales
- Créer et gérer votre compte, vous connecter par lien magique — **exécution du contrat** (CGU).
- Générer recettes, images, traductions et analyses — **exécution du contrat** (CGU).
- Appliquer les quotas et maîtriser le budget d'intelligence artificielle — **intérêt légitime**.
- Sécuriser le service (journal d'audit, sessions, limitation des abus) — **intérêt légitime**.
- Conserver la preuve de vos consentements — **obligation légale**.

## Destinataires et sous-traitants
Vos données ne sont ni vendues ni louées. Elles sont accessibles à l'éditeur et à ses sous-traitants, chacun pour sa mission :
- **Supabase** — base de données et stockage des photos, Union européenne ;
- **Vercel** — hébergement de l'application (région de Dublin) ;
- **Resend** — envoi des e-mails de connexion et d'invitation ;
- **Anthropic** — rédaction des recettes, traductions et analyses (Claude) ;
- **fal.ai** — création des photos.

Certains de ces prestataires sont établis aux États-Unis. Les transferts sont encadrés par les clauses contractuelles types de la Commission européenne et, le cas échéant, par le cadre de protection des données UE–États-Unis. Seules les informations utiles à la génération (paramètres de la recette, texte à traduire, description du dressage…) sont transmises aux services d'intelligence artificielle, jamais votre adresse e-mail. Culinova n'utilise pas vos contenus pour entraîner des modèles.

## Durées de conservation
- **Compte et contenus** : tant que le compte existe. À la suppression du compte, ils sont effacés immédiatement, photos comprises.
- **Compte suspendu** : données conservées jusqu'à sa réactivation ou sa suppression.
- **Liens de connexion** : 15 minutes ; **sessions** : 30 jours au plus, ou jusqu'à leur fermeture.
- **Tentatives de connexion** (limitation des abus) : quelques jours.
- **Journal de sécurité** : 12 mois, puis effacement automatique.
- **Preuves de consentement** : durée du compte.
- **Coûts des générations** : conservés sans lien avec votre identité après la suppression du compte, pour le suivi du budget.

## Vos droits
Vous disposez des droits d'accès, de rectification, d'effacement, de limitation, d'opposition et de portabilité de vos données, ainsi que du droit de définir des directives sur leur sort après votre décès.
- **Export** : « Mon compte » → « Télécharger mes données » (fichier JSON lisible).
- **Suppression** : « Mon compte » → « Supprimer mon compte ».
- **Autres demandes** : {{editeur.email}}. Une réponse est apportée sous un mois.

Vous pouvez introduire une réclamation auprès de la **CNIL** (cnil.fr).

## Sécurité
Connexion sans mot de passe par lien à usage unique, second facteur obligatoire pour les administrateurs, chiffrement des échanges (HTTPS), photos stockées dans un espace privé, accès de l'administration tracés dans un journal d'audit.

## Cookies
Seuls des cookies indispensables au fonctionnement sont utilisés. Le détail figure dans la politique cookies.

## Modifications
Cette politique peut évoluer ; la nouvelle version vous est présentée à votre prochaine visite.`,
  },
  {
    type: "cookies" as const,
    version: "1.0",
    title: "Politique cookies",
    bodyMd: `## En bref
Culinova n'utilise **ni cookie publicitaire, ni mesure d'audience, ni traceur de réseaux sociaux**. Seuls des éléments indispensables au fonctionnement du service sont déposés : ils sont dispensés de consentement et aucun bandeau ne vous est donc demandé.

## Cookies et stockages utilisés
- **culinova.session_token** — garde votre session ouverte après la connexion ; 30 jours au plus.
- **culinova.admin_session** — permet à un administrateur de revenir à l'administration après une assistance « en tant que » ; 1 heure.
- **NEXT_LOCALE** — retient la langue choisie, le cas échéant ; 1 an.
- **culinova-theme** (stockage local du navigateur) — retient le thème clair ou sombre choisi ; jusqu'à effacement.

## Les gérer
Vous pouvez supprimer ces éléments depuis les réglages de votre navigateur. Sans le cookie de session, vous serez simplement déconnecté·e.

## Évolution
Si des outils de mesure d'audience ou des services tiers non indispensables étaient ajoutés, votre accord serait demandé au préalable et vous pourriez le retirer à tout moment.`,
  },
];

/** Registre des traitements (RGPD), remplacé à chaque seed. */
export const PROCESSING_REGISTER = [
  {
    purpose: "Gestion des comptes, invitations et authentification",
    legalBasis: "Exécution du contrat (CGU)",
    dataCategories: ["identité", "e-mail", "code d'invitation", "sessions"],
    retention: "Durée de vie du compte",
    processors: ["Supabase", "Vercel", "Resend"],
  },
  {
    purpose: "Génération de recettes, traductions, analyses et images par IA",
    legalBasis: "Exécution du contrat (CGU)",
    dataCategories: ["paramètres de création", "recettes", "photos"],
    retention: "Durée de vie du compte",
    processors: ["Anthropic", "fal.ai", "Supabase", "Inngest"],
  },
  {
    purpose: "Gestion des prix, coûts, marges et valeurs nutritionnelles",
    legalBasis: "Exécution du contrat (CGU)",
    dataCategories: ["ingrédients", "prix", "fournisseurs", "réglages"],
    retention: "Durée de vie du compte",
    processors: ["Supabase", "Anthropic"],
  },
  {
    purpose: "Quotas et maîtrise du budget IA",
    legalBasis: "Intérêt légitime",
    dataCategories: ["consommation", "coût des générations"],
    retention: "Durée de vie du compte, puis anonymisé",
    processors: ["Supabase"],
  },
  {
    purpose: "Sécurité et journal d'audit",
    legalBasis: "Intérêt légitime",
    dataCategories: ["adresse IP", "navigateur", "actions sensibles"],
    retention: "12 mois",
    processors: ["Supabase", "Vercel"],
  },
  {
    purpose: "Preuve des consentements",
    legalBasis: "Obligation légale",
    dataCategories: ["version acceptée", "date", "adresse IP", "navigateur"],
    retention: "Durée de vie du compte",
    processors: ["Supabase"],
  },
];
