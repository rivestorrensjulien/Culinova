-- Provenance des demandes d'invitation (réseau, canal, recette d'origine).
ALTER TABLE "invitation_requests" ADD COLUMN "source" text;--> statement-breakpoint
ALTER TABLE "invitation_requests" ADD COLUMN "source_medium" text;--> statement-breakpoint
ALTER TABLE "invitation_requests" ADD COLUMN "source_campaign" text;--> statement-breakpoint
ALTER TABLE "invitation_requests" ADD COLUMN "source_recipe" text;--> statement-breakpoint
ALTER TABLE "invitation_requests" ADD COLUMN "source_referrer" text;