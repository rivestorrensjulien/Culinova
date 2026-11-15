CREATE TABLE "price_aliases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"store_key" text DEFAULT '' NOT NULL,
	"label_key" text NOT NULL,
	"ingredient_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reference_prices" (
	"name_key" text NOT NULL,
	"unit" text NOT NULL,
	"price_per_unit" numeric(12, 4) NOT NULL,
	"owners" integer NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reference_prices_name_key_unit_pk" PRIMARY KEY("name_key","unit")
);
--> statement-breakpoint
ALTER TABLE "ingredient_prices" ADD COLUMN "is_promo" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "supplier_invoice_lines" ADD COLUMN "clean_name" text;--> statement-breakpoint
ALTER TABLE "supplier_invoice_lines" ADD COLUMN "promo" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "supplier_invoices" ADD COLUMN "kind" text DEFAULT 'invoice' NOT NULL;--> statement-breakpoint
ALTER TABLE "price_aliases" ADD CONSTRAINT "price_aliases_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "price_aliases" ADD CONSTRAINT "price_aliases_ingredient_id_ingredients_id_fk" FOREIGN KEY ("ingredient_id") REFERENCES "public"."ingredients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "price_aliases_owner_label_idx" ON "price_aliases" USING btree ("owner_id","store_key","label_key");