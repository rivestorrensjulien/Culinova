-- Pages publiques des recettes (liens des réseaux sociaux), sans prix ni marges.
CREATE TABLE "recipe_public_pages" (
	"recipe_id" uuid PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "recipe_public_pages" ADD CONSTRAINT "recipe_public_pages_recipe_id_recipes_id_fk" FOREIGN KEY ("recipe_id") REFERENCES "public"."recipes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipe_public_pages" ADD CONSTRAINT "recipe_public_pages_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "recipe_public_pages_slug_unique" ON "recipe_public_pages" USING btree ("slug");