-- Prix de vente TTC tel que saisi (le prix HT en est déduit) : évite les écarts d'arrondi à l'affichage.
ALTER TABLE "recipe_pricing" ADD COLUMN "selling_price_ttc_cents" integer;
