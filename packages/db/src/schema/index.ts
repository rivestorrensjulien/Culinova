/**
 * Schéma de la base de données V1 (Drizzle), en 9 domaines.
 *
 * Conventions : identifiants UUID ; created_at / updated_at partout ; montants
 * en centimes (`*_cents`, entiers) ; prix au kilo en euros, `numeric(12,4)` ;
 * quantités en g / ml ; durées en secondes ; coûts IA en micro-dollars.
 *
 * Phase 2 (vente, organisations, Lab, catalogue) : ajout de tables, sans
 * modification des tables existantes.
 */
export * from "./access";
export * from "./ai";
export * from "./culinary";
export * from "./identity";
export * from "./ingredients";
export * from "./kitchen";
export * from "./legal";
export * from "./recipes";
export * from "./settings";
