-- « Mes bases » : produits signalés comme achetés tout prêts, et rendement lisible d'une base (8 pains).
ALTER TABLE "recipe_ingredients" ADD COLUMN "store_bought" boolean;--> statement-breakpoint
ALTER TABLE "base_recipes" ADD COLUMN "yield_display_quantity" numeric(12, 3);--> statement-breakpoint
ALTER TABLE "base_recipes" ADD COLUMN "yield_display_unit" text;
