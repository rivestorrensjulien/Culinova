/**
 * Versions PROVISOIRES des documents juridiques (jalon J1), pour enregistrer les
 * consentements dès l'inscription. Les textes définitifs arrivent au jalon J6
 * et doivent être validés par un juriste avant la mise en production.
 */
export const LEGAL_DRAFTS = [
  {
    type: "cgu" as const,
    version: "0.1",
    title: "Conditions générales d'utilisation",
    bodyMd: `> **Version provisoire** — texte à faire valider par un juriste avant la mise en production.

## Objet
Culinova est une plateforme culinaire propulsée par l'intelligence artificielle. Les présentes conditions encadrent son utilisation pendant la phase d'accès sur invitation.

## Accès
L'accès est **gratuit**, **sur invitation uniquement**, au moyen d'un code individuel et personnel. Il peut être **suspendu ou révoqué à tout moment**, sans préavis ni indemnité. Le service est fourni sans garantie de continuité.

## Quotas
L'utilisation est soumise à des quotas mensuels (recettes générées, images, régénérations), remis à zéro le 1er de chaque mois.

## Contenus générés par IA
Les recettes, images et textes sont produits par des modèles d'intelligence artificielle. Ils peuvent contenir des erreurs : vérifiez notamment les allergènes, les cuissons et les quantités avant toute utilisation. Les coûts et prix de vente proposés sont des outils d'aide à la gestion, sans garantie.

## Données
Le traitement des données personnelles est décrit dans la politique de confidentialité.`,
  },
  {
    type: "privacy" as const,
    version: "0.1",
    title: "Politique de confidentialité",
    bodyMd: `> **Version provisoire** — texte à faire valider par un juriste avant la mise en production.

## Données collectées
Adresse e-mail, nom (facultatif), code d'invitation utilisé, dates de connexion, adresse IP et navigateur (sécurité), recettes et préférences culinaires, consommation des quotas.

## Finalités
Fournir le service, sécuriser les comptes (connexion par lien magique, journal d'audit), mesurer la consommation et maîtriser le coût de l'IA.

## Sous-traitants
Hébergement (Vercel, Supabase — Union européenne), envoi d'e-mails (Resend), génération par IA (Anthropic, fal.ai).

## Durées de conservation
Les données du compte sont conservées tant que le compte existe ; un compte suspendu conserve ses données jusqu'à sa réactivation ou sa suppression.

## Vos droits
Accès, rectification, export et suppression de vos données : depuis votre compte ou par e-mail.`,
  },
];

/** Registre des traitements (RGPD) — premières entrées. */
export const PROCESSING_REGISTER = [
  {
    purpose: "Gestion des comptes et authentification",
    legalBasis: "Exécution du contrat (CGU)",
    dataCategories: ["identité", "e-mail", "journaux de connexion"],
    retention: "Durée de vie du compte",
    processors: ["Supabase", "Vercel", "Resend"],
  },
  {
    purpose: "Génération de recettes et d'images par IA",
    legalBasis: "Exécution du contrat (CGU)",
    dataCategories: ["paramètres de création", "recettes"],
    retention: "Durée de vie du compte",
    processors: ["Anthropic", "fal.ai", "Inngest"],
  },
  {
    purpose: "Sécurité et journal d'audit",
    legalBasis: "Intérêt légitime",
    dataCategories: ["adresse IP", "navigateur", "actions sensibles"],
    retention: "12 mois",
    processors: ["Supabase", "Sentry"],
  },
];
