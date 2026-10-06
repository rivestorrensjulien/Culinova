/** Modèles utilisés par défaut (modifiables par variable d'environnement). */
export const DEFAULT_RECIPE_MODEL = "claude-sonnet-5-5";
export const DEFAULT_IMAGE_MODEL = "fal-ai/flux-pro/v1.1";

/** Formats d'image : tous recadrés depuis une seule image HD (pas de génération supplémentaire). */
export const IMAGE_FORMATS = ["1:1", "4:5", "9:16", "16:9"] as const;
export type ImageFormat = (typeof IMAGE_FORMATS)[number];
