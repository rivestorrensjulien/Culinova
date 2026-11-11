-- Mode particulier par défaut (décision de Julien du 11/11) : les comptes déjà ouverts gardent
-- l'affichage pro qu'ils connaissaient ; chacun peut changer dans « Mon compte ».
ALTER TABLE "users" ADD COLUMN "pro_mode" boolean DEFAULT false NOT NULL;--> statement-breakpoint
UPDATE "users" SET "pro_mode" = true;
