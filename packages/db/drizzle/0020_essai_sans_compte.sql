CREATE TABLE "recipe_trials" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"token" text NOT NULL,
	"generation_id" uuid,
	"status" text DEFAULT 'queued' NOT NULL,
	"input" jsonb NOT NULL,
	"recipe" jsonb,
	"error" text,
	"source_recipe" text,
	"claimed_by" uuid,
	"claimed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "recipe_trials_token_unique" UNIQUE("token")
);
--> statement-breakpoint
ALTER TABLE "invitation_requests" ADD COLUMN "trial_id" uuid;--> statement-breakpoint
ALTER TABLE "recipe_trials" ADD CONSTRAINT "recipe_trials_claimed_by_users_id_fk" FOREIGN KEY ("claimed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "recipe_trials_created_idx" ON "recipe_trials" USING btree ("created_at");--> statement-breakpoint
ALTER TABLE "invitation_requests" ADD CONSTRAINT "invitation_requests_trial_id_recipe_trials_id_fk" FOREIGN KEY ("trial_id") REFERENCES "public"."recipe_trials"("id") ON DELETE set null ON UPDATE no action;