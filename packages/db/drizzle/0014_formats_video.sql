-- Formats courts des vidéos (vue éclatée, coupe, vue du dessus, geste) et vidéos à refaire demandées par l'administrateur.
CREATE TABLE "recipe_video_requests" (
	"recipe_id" uuid PRIMARY KEY NOT NULL,
	"format" text,
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"requested_by" uuid
);
--> statement-breakpoint
ALTER TABLE "recipe_videos" ADD COLUMN "format" text;--> statement-breakpoint
ALTER TABLE "recipe_video_requests" ADD CONSTRAINT "recipe_video_requests_recipe_id_recipes_id_fk" FOREIGN KEY ("recipe_id") REFERENCES "public"."recipes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipe_video_requests" ADD CONSTRAINT "recipe_video_requests_requested_by_users_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;