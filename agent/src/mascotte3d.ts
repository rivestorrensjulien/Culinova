/**
 * Chef Ju en 3D (comme dans les vidéos réalistes), corps entier, bras croisés, sur fond
 * transparent : 4 propositions à choisir, puis l'image retenue est enregistrée dans
 * agent/public/mascotte-3d.png (carte de fin des vidéos).
 *
 *   npm run mascotte3d
 *
 * Variables : FAL_KEY (environ 0,20 €). Résultat : sortie/comparatif/mascotte-3d-1..4.png.
 */
import { bundle } from "@remotion/bundler";
import { renderStill, selectComposition } from "@remotion/renderer";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { dataUri, download, FalClient } from "./fal.ts";
import { type ImageResult, notice, retry } from "./outils.ts";
import { CHARACTER, IMAGE_MODEL, REFERENCE_ID } from "./video/realistic.ts";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const output = join(root, "sortie", "comparatif");
const CUTOUT_MODEL = "fal-ai/birefnet";

const PROMPT = [
  CHARACTER,
  "Full-body portrait of him standing, facing the camera, arms crossed on his chest, confident warm smile,",
  "watch visible on his wrist, black trousers and black shoes, whole body in the frame with a small margin.",
  "Plain pure white studio background, soft studio lighting, gentle shadow under his feet.",
  "No text, no logo, no watermark.",
].join(" ");

async function main() {
  const falKey = process.env.FAL_KEY?.trim();
  if (!falKey) throw new Error("FAL_KEY est nécessaire.");
  const fal = new FalClient(falKey);
  await mkdir(output, { recursive: true });
  const serveUrl = await bundle({
    entryPoint: join(root, "src", "video", "index.ts"),
    publicDir: join(root, "public"),
  });
  const referenceFile = join(output, "mascotte-reference.png");
  const still = await selectComposition({ serveUrl, id: REFERENCE_ID, inputProps: {} });
  await renderStill({ composition: still, serveUrl, output: referenceFile, inputProps: {} });
  const reference = dataUri(new Uint8Array(await readFile(referenceFile)), "image/png");

  const result = await retry(() =>
    fal.run<ImageResult>(IMAGE_MODEL, {
      prompt: PROMPT,
      image_urls: [reference],
      aspect_ratio: "3:4",
      output_format: "png",
      num_images: 4,
      limit_generations: false,
    }),
  );
  for (const [i, image] of result.images.entries()) {
    const file = join(output, `mascotte-3d-${i + 1}.png`);
    try {
      const cut = await retry(() =>
        fal.run<{ image: { url: string } }>(CUTOUT_MODEL, { image_url: image.url }),
      );
      await writeFile(file, await download(cut.image.url));
    } catch (error) {
      // Détourage impossible : on garde le fond blanc.
      console.error(`Détourage ${i + 1} : ${error instanceof Error ? error.message : String(error)}`);
      await writeFile(file, await download(image.url));
    }
  }
  notice(`${result.images.length} propositions de Chef Ju en 3D`);
}

main().catch((error) => {
  console.error(error);
  const note = error instanceof Error ? error.message : String(error);
  if (process.env.GITHUB_ACTIONS) {
    console.log(`::error title=Mascotte 3D::${note.replace(/\r?\n/g, " ").slice(0, 900)}`);
  }
  process.exit(1);
});
