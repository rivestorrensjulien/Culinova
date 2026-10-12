/** Recadrage des formats d'image (1:1, 4:5, 9:16, 16:9) à partir d'une seule image HD. */

export interface CropBox {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** Rapport largeur:hauteur d'un format « L:H ». */
export function ratioOf(format: string): { width: number; height: number } {
  const match = /^(\d+):(\d+)$/.exec(format);
  if (!match || Number(match[1]) <= 0 || Number(match[2]) <= 0)
    throw new RangeError(`Format invalide : ${format}`);
  return { width: Number(match[1]), height: Number(match[2]) };
}

/**
 * Plus grand cadre centré au rapport demandé, contenu dans l'image source.
 * Dimensions paires (meilleure compatibilité des encodeurs vidéo et réseaux sociaux).
 */
export function centeredCrop(sourceWidth: number, sourceHeight: number, format: string): CropBox {
  if (!(sourceWidth > 0 && sourceHeight > 0)) throw new RangeError("Dimensions source invalides");
  const ratio = ratioOf(format);
  let width = sourceWidth;
  let height = Math.round((sourceWidth * ratio.height) / ratio.width);
  if (height > sourceHeight) {
    height = sourceHeight;
    width = Math.round((sourceHeight * ratio.width) / ratio.height);
  }
  width -= width % 2;
  height -= height % 2;
  return {
    left: Math.floor((sourceWidth - width) / 2),
    top: Math.floor((sourceHeight - height) / 2),
    width,
    height,
  };
}
