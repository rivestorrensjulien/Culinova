-- Traductions : date de validation par la personne (une traduction proposée par l'IA reste à valider).
ALTER TABLE "recipe_translations" ADD COLUMN "validated_at" timestamp with time zone;
