-- Nutrition : aliments de référence (Ciqual, USDA) et correspondances ingrédient → aliment par personne.
CREATE TABLE "nutrition_foods" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source" text NOT NULL,
	"code" text NOT NULL,
	"name_fr" text,
	"name_en" text,
	"per_100g" jsonb NOT NULL,
	"version" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "nutrition_foods_source_code" ON "nutrition_foods" USING btree ("source","code");--> statement-breakpoint
CREATE TABLE "ingredient_nutrition_links" (
	"owner_id" uuid NOT NULL,
	"ingredient_id" uuid NOT NULL,
	"food_id" uuid,
	"status" text DEFAULT 'proposed' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ingredient_nutrition_links_owner_id_ingredient_id_pk" PRIMARY KEY("owner_id","ingredient_id")
);
--> statement-breakpoint
ALTER TABLE "ingredient_nutrition_links" ADD CONSTRAINT "ingredient_nutrition_links_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ingredient_nutrition_links" ADD CONSTRAINT "ingredient_nutrition_links_ingredient_id_ingredients_id_fk" FOREIGN KEY ("ingredient_id") REFERENCES "public"."ingredients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ingredient_nutrition_links" ADD CONSTRAINT "ingredient_nutrition_links_food_id_nutrition_foods_id_fk" FOREIGN KEY ("food_id") REFERENCES "public"."nutrition_foods"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ingredient_nutrition_links_food_idx" ON "ingredient_nutrition_links" USING btree ("food_id");
