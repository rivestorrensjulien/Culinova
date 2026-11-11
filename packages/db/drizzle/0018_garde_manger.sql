ALTER TABLE "shopping_list_items" ADD COLUMN "in_pantry" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "shopping_list_items" ADD COLUMN "pantry_quantity" numeric(12, 3);