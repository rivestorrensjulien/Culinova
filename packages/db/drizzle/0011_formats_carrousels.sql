-- Publications par format (vidéo, photo, carrousel) et carrousels Instagram fabriqués par l'agent.
ALTER TABLE "recipe_publications" ADD COLUMN "format" text DEFAULT 'video' NOT NULL;--> statement-breakpoint
DROP INDEX "recipe_publications_unique";--> statement-breakpoint
CREATE UNIQUE INDEX "recipe_publications_unique" ON "recipe_publications" USING btree ("recipe_id","platform","format");--> statement-breakpoint
CREATE TABLE "recipe_carousels" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"recipe_id" uuid NOT NULL,
	"recipe_version_id" uuid NOT NULL,
	"image_id" uuid,
	"status" text DEFAULT 'uploading' NOT NULL,
	"slide_count" integer NOT NULL,
	"storage_prefix" text NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "recipe_carousels" ADD CONSTRAINT "recipe_carousels_recipe_id_recipes_id_fk" FOREIGN KEY ("recipe_id") REFERENCES "public"."recipes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipe_carousels" ADD CONSTRAINT "recipe_carousels_recipe_version_id_recipe_versions_id_fk" FOREIGN KEY ("recipe_version_id") REFERENCES "public"."recipe_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "recipe_carousels_recipe_idx" ON "recipe_carousels" USING btree ("recipe_id","created_at");
