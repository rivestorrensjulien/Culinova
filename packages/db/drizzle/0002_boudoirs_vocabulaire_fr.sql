-- Vocabulaire français : « savoiardi » devient « boudoirs » dans les recettes déjà enregistrées.
-- « Biscuits savoiardi (boudoirs italiens) » → « Biscuits boudoirs » ; « 8 savoiardi » → « 8 boudoirs ».
CREATE OR REPLACE FUNCTION culinova_fr_boudoirs(t text) RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT replace(replace(
    regexp_replace(
      regexp_replace(t, '(biscuits?) savoiardi \(boudoirs italiens\)', '\1 boudoirs', 'gi'),
      '\s*\((biscuits )?savoiardi\)', '', 'gi'),
    'Savoiardi', 'Boudoirs'), 'savoiardi', 'boudoirs')
$$;--> statement-breakpoint
CREATE OR REPLACE FUNCTION culinova_fr_boudoirs_array(a text[]) RETURNS text[] LANGUAGE sql IMMUTABLE AS $$
  SELECT coalesce(array_agg(culinova_fr_boudoirs(x) ORDER BY n), '{}'::text[])
  FROM unnest(a) WITH ORDINALITY AS u(x, n)
$$;--> statement-breakpoint
UPDATE "recipe_versions" SET
  "name" = culinova_fr_boudoirs("name"),
  "description" = culinova_fr_boudoirs("description"),
  "plating" = culinova_fr_boudoirs("plating"::text)::jsonb,
  "equipment" = culinova_fr_boudoirs_array("equipment"),
  "tips" = culinova_fr_boudoirs_array("tips")
WHERE concat_ws('|', "name", "description", "plating"::text, array_to_string("equipment", '|'), array_to_string("tips", '|')) ILIKE '%savoiardi%';--> statement-breakpoint
UPDATE "recipe_ingredients" SET
  "label" = culinova_fr_boudoirs("label"),
  "preparation" = culinova_fr_boudoirs("preparation"),
  "display_unit" = culinova_fr_boudoirs("display_unit")
WHERE concat_ws('|', "label", "preparation", "display_unit") ILIKE '%savoiardi%';--> statement-breakpoint
UPDATE "recipe_steps" SET
  "action" = culinova_fr_boudoirs("action"),
  "expected_result" = culinova_fr_boudoirs("expected_result"),
  "equipment" = culinova_fr_boudoirs_array("equipment")
WHERE concat_ws('|', "action", "expected_result", array_to_string("equipment", '|')) ILIKE '%savoiardi%';--> statement-breakpoint
UPDATE "recipe_translations" SET "payload" = culinova_fr_boudoirs("payload"::text)::jsonb
WHERE "payload"::text ILIKE '%savoiardi%';--> statement-breakpoint
UPDATE "social_contents" SET
  "title" = culinova_fr_boudoirs("title"),
  "description" = culinova_fr_boudoirs("description"),
  "caption" = culinova_fr_boudoirs("caption"),
  "hashtags" = culinova_fr_boudoirs_array("hashtags")
WHERE concat_ws('|', "title", "description", "caption", array_to_string("hashtags", '|')) ILIKE '%savoiardi%';--> statement-breakpoint
UPDATE "ingredients" SET "canonical_name" = culinova_fr_boudoirs("canonical_name")
WHERE "canonical_name" ILIKE '%savoiardi%';--> statement-breakpoint
UPDATE "ingredient_translations" SET
  "name" = culinova_fr_boudoirs("name"),
  "plural" = culinova_fr_boudoirs("plural")
WHERE concat_ws('|', "name", "plural") ILIKE '%savoiardi%';--> statement-breakpoint
DROP FUNCTION culinova_fr_boudoirs_array(text[]);--> statement-breakpoint
DROP FUNCTION culinova_fr_boudoirs(text);
