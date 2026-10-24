-- Publications programmées : validées par l'administrateur, lancées automatiquement à l'heure prévue.
CREATE TABLE "scheduled_publications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"recipe_id" uuid NOT NULL,
	"platform" text NOT NULL,
	"format" text NOT NULL,
	"scheduled_at" timestamp with time zone NOT NULL,
	"caption" text,
	"tiktok" jsonb,
	"status" text DEFAULT 'scheduled' NOT NULL,
	"created_by" uuid NOT NULL,
	"started_at" timestamp with time zone,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "scheduled_publications" ADD CONSTRAINT "scheduled_publications_recipe_id_recipes_id_fk" FOREIGN KEY ("recipe_id") REFERENCES "public"."recipes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scheduled_publications" ADD CONSTRAINT "scheduled_publications_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "scheduled_publications_due_idx" ON "scheduled_publications" USING btree ("status","scheduled_at");--> statement-breakpoint
CREATE INDEX "scheduled_publications_recipe_idx" ON "scheduled_publications" USING btree ("recipe_id");