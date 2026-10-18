-- Vidéo d'une recette : photo 9:16 utilisée (la vidéo est refaite si la photo change).
ALTER TABLE "recipe_videos" ADD COLUMN "image_id" uuid;
