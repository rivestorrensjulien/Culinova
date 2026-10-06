ALTER TABLE "ai_generations" ADD COLUMN "draft_id" uuid;--> statement-breakpoint
ALTER TABLE "ai_generations" ADD COLUMN "recipe_id" uuid;--> statement-breakpoint
ALTER TABLE "ai_generations" ADD COLUMN "generation_params_id" uuid;--> statement-breakpoint
ALTER TABLE "ai_generations" ADD COLUMN "instruction" text;--> statement-breakpoint
ALTER TABLE "ai_generations" ADD COLUMN "attempts" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "generation_params" ADD COLUMN "snapshot" jsonb;--> statement-breakpoint
ALTER TABLE "recipe_drafts" ADD COLUMN "status" text DEFAULT 'editing' NOT NULL;--> statement-breakpoint
ALTER TABLE "recipe_drafts" ADD COLUMN "generation_id" uuid;--> statement-breakpoint
ALTER TABLE "recipe_drafts" ADD COLUMN "error" text;--> statement-breakpoint
ALTER TABLE "recipe_ingredients" ADD COLUMN "label" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "recipe_versions" ADD COLUMN "description" text;--> statement-breakpoint
ALTER TABLE "recipe_versions" ADD COLUMN "cuisine_label" text;--> statement-breakpoint
ALTER TABLE "recipe_versions" ADD COLUMN "allergens" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "recipe_versions" ADD COLUMN "diets" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "recipe_versions" ADD COLUMN "tips" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
CREATE INDEX "recipe_drafts_user_idx" ON "recipe_drafts" USING btree ("user_id","status");