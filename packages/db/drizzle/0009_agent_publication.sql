-- Agent de publication : vidéos des recettes, comptes reliés, statistiques.
CREATE TABLE "recipe_videos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"recipe_id" uuid NOT NULL,
	"recipe_version_id" uuid NOT NULL,
	"status" text DEFAULT 'uploading' NOT NULL,
	"storage_key" text NOT NULL,
	"duration_ms" integer NOT NULL,
	"width" integer NOT NULL,
	"height" integer NOT NULL,
	"size_bytes" integer NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "social_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"platform" text NOT NULL,
	"account_id" text NOT NULL,
	"username" text,
	"access_token_enc" text NOT NULL,
	"refresh_token_enc" text,
	"expires_at" timestamp with time zone,
	"refresh_expires_at" timestamp with time zone,
	"scopes" text[] DEFAULT '{}'::text[] NOT NULL,
	"connected_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "social_post_stats" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"publication_id" uuid NOT NULL,
	"collected_at" timestamp with time zone DEFAULT now() NOT NULL,
	"views" integer,
	"reach" integer,
	"likes" integer,
	"comments" integer,
	"shares" integer,
	"saves" integer,
	"raw" jsonb
);
--> statement-breakpoint
CREATE TABLE "social_account_stats" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"platform" text NOT NULL,
	"collected_at" timestamp with time zone DEFAULT now() NOT NULL,
	"followers" integer,
	"posts" integer,
	"likes" integer,
	"raw" jsonb
);
--> statement-breakpoint
ALTER TABLE "recipe_publications" ADD COLUMN "video_id" uuid;--> statement-breakpoint
ALTER TABLE "recipe_publications" ADD COLUMN "external_id" text;--> statement-breakpoint
ALTER TABLE "recipe_publications" ADD COLUMN "post_id" text;--> statement-breakpoint
ALTER TABLE "recipe_publications" ADD COLUMN "privacy" text;--> statement-breakpoint
ALTER TABLE "recipe_videos" ADD CONSTRAINT "recipe_videos_recipe_id_recipes_id_fk" FOREIGN KEY ("recipe_id") REFERENCES "public"."recipes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipe_videos" ADD CONSTRAINT "recipe_videos_recipe_version_id_recipe_versions_id_fk" FOREIGN KEY ("recipe_version_id") REFERENCES "public"."recipe_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "social_accounts" ADD CONSTRAINT "social_accounts_connected_by_users_id_fk" FOREIGN KEY ("connected_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "social_post_stats" ADD CONSTRAINT "social_post_stats_publication_id_recipe_publications_id_fk" FOREIGN KEY ("publication_id") REFERENCES "public"."recipe_publications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "recipe_videos_recipe_idx" ON "recipe_videos" USING btree ("recipe_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "social_accounts_platform_unique" ON "social_accounts" USING btree ("platform");--> statement-breakpoint
CREATE INDEX "social_post_stats_publication_idx" ON "social_post_stats" USING btree ("publication_id","collected_at");--> statement-breakpoint
CREATE INDEX "social_account_stats_platform_idx" ON "social_account_stats" USING btree ("platform","collected_at");
