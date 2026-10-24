-- « Commente RECETTE » : un message privé avec le lien de la recette par commentaire Instagram.
CREATE TABLE "instagram_comment_replies" (
	"comment_id" text PRIMARY KEY NOT NULL,
	"recipe_id" uuid,
	"media_id" text NOT NULL,
	"username" text,
	"status" text DEFAULT 'sending' NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "instagram_comment_replies" ADD CONSTRAINT "instagram_comment_replies_recipe_id_recipes_id_fk" FOREIGN KEY ("recipe_id") REFERENCES "public"."recipes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "instagram_comment_replies_created_idx" ON "instagram_comment_replies" USING btree ("created_at");