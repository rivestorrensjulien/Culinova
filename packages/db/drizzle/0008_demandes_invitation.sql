-- Demandes d'invitation (page d'accueil) : profil, langue, consentement et décision de l'administrateur.
ALTER TABLE "invitation_requests" ADD COLUMN "profile" text;--> statement-breakpoint
ALTER TABLE "invitation_requests" ADD COLUMN "locale" text DEFAULT 'fr' NOT NULL;--> statement-breakpoint
ALTER TABLE "invitation_requests" ADD COLUMN "consented_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "invitation_requests" ADD COLUMN "decided_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "invitation_requests" ADD COLUMN "decided_by" uuid;--> statement-breakpoint
ALTER TABLE "invitation_requests" ADD CONSTRAINT "invitation_requests_decided_by_users_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "invitation_requests_email_idx" ON "invitation_requests" USING btree (lower("email"));--> statement-breakpoint
CREATE INDEX "invitation_requests_status_idx" ON "invitation_requests" USING btree ("status","created_at");
