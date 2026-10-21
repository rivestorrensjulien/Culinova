/**
 * Format court « vue éclatée » d'une recette (rien n'est envoyé à Culinova ni publié) :
 * photo → les couches s'écartent (clip IA) → vue du dessus, couche par couche (images IA)
 * → photo finale → Chef Ju fait le baiser du chef et dit « Et voilà ! » (clip IA avec le son).
 *
 *   npm run eclate -- --recette=<identifiant ou morceau du nom> [--nouveau=1]
 *   [--reprendre=1] : réutilise les clips et images de la fabrication précédente (sortie/comparatif),
 *   seule la synchronisation des lèvres est refaite (≈ 0,07 €)
 *
 * Variables : CULINOVA_URL, AGENT_API_KEY, FAL_KEY (environ 1,20 € par vidéo chez fal.ai).
 * Résultat : sortie/comparatif/D-format-eclate.mp4 et les images intermédiaires.
 */
import { bundle } from "@remotion/bundler";
import { renderMedia, renderStill, selectComposition } from "@remotion/renderer";
import { copyFile, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { CulinovaClient } from "./culinova.ts";
import { dataUri, download, FalClient, falUpload } from "./fal.ts";
import {
  arg,
  finishing,
  keepClips,
  type ImageResult,
  notice,
  pickJob,
  retry,
  type VideoResult,
} from "./outils.ts";
import {
  EXPLODE_MOTION,
  EXPLODED_ID,
  type ExplodedProps,
  explodedImagePrompt,
  LIPSYNC_MODEL,
  VOICE_TRACK_ID,
  topAddPrompt,
  topEmptyPrompt,
  VOILA_MOTION,
  voilaImagePrompt,
} from "./video/exploded.ts";
import { IMAGE_MODEL, NEGATIVE_PROMPT, REFERENCE_ID, VIDEO_MODEL } from "./video/realistic.ts";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const output = join(root, "sortie", "comparatif");
const assets = join(root, "public", "realiste");

async function main() {
  const baseUrl = process.env.CULINOVA_URL?.trim().replace(/\/$/, "");
  const apiKey = process.env.AGENT_API_KEY?.trim();
  const falKey = process.env.FAL_KEY?.trim();
  if (!baseUrl || !apiKey || !falKey) {
    throw new Error("CULINOVA_URL, AGENT_API_KEY et FAL_KEY sont nécessaires.");
  }
  const client = new CulinovaClient(baseUrl, apiKey);
  const fal = new FalClient(falKey);
  const job = await pickJob(client, arg("recette"));
  const layers = await client.layers(job.recipeId, arg("nouveau") === "1");
  notice(
    `Vue éclatée de « ${job.name} » : ${layers.layers.map((l) => l.name).join(" · ")}` +
      (layers.layered ? "" : " (plat peu adapté à la vue éclatée)"),
  );
  await rm(assets, { recursive: true, force: true });
  await mkdir(assets, { recursive: true });
  await mkdir(output, { recursive: true });
  const photo = await download(job.photoUrl);
  await writeFile(join(assets, "photo.jpg"), photo);
  const dish = dataUri(photo, "image/jpeg");

  let serveUrl = await bundle({
    entryPoint: join(root, "src", "video", "index.ts"),
    publicDir: join(root, "public"),
  });
  const referenceFile = join(output, "mascotte-reference.png");
  const still = await selectComposition({ serveUrl, id: REFERENCE_ID, inputProps: {} });
  await renderStill({ composition: still, serveUrl, output: referenceFile, inputProps: {} });
  const reference = dataUri(new Uint8Array(await readFile(referenceFile)), "image/png");

  const edit = async (prompt: string, inputs: string[], file: string, keep = false) => {
    const result = await retry(() =>
      fal.run<ImageResult>(IMAGE_MODEL, {
        prompt,
        image_urls: inputs,
        aspect_ratio: "9:16",
        output_format: "jpeg",
        num_images: 1,
      }),
    );
    const url = result.images[0]?.url;
    if (!url) throw new Error(`Pas d'image pour ${file}`);
    const bytes = await download(url);
    await writeFile(join(output, file), bytes);
    if (keep) await writeFile(join(assets, file), bytes);
    return url;
  };
  const animate = async (start: string, end: string | null, prompt: string, file: string, audio = false) => {
    const clip = await retry(() =>
      fal.run<VideoResult>(VIDEO_MODEL, {
        prompt,
        start_image_url: start,
        ...(end ? { end_image_url: end } : {}),
        duration: "5",
        generate_audio: audio,
        negative_prompt: NEGATIVE_PROMPT,
      }),
    );
    await writeFile(join(assets, file), await download(clip.video.url));
    return `realiste/${file}`;
  };

  let explodeClip: string;
  let voilaClip: string;
  const topViews: string[] = [];
  if (arg("reprendre") === "1") {
    // Clips et vues du dessus de la fabrication précédente (branche comparatif-video).
    for (const file of ["eclate.mp4", "et-voila.mp4"]) {
      await copyFile(join(output, "clips", file), join(assets, file));
    }
    for (const file of (await readdir(output)).filter((f) => /^dessus-\d+\.jpg$/.test(f)).sort()) {
      await copyFile(join(output, file), join(assets, file));
      topViews.push(`realiste/${file}`);
    }
    explodeClip = "realiste/eclate.mp4";
    voilaClip = "realiste/et-voila.mp4";
    notice("Clips et vues du dessus repris de la fabrication précédente");
  } else {
    // 1. Vue éclatée (image), puis le clip où les couches s'écartent depuis la photo (lien signé 1 h).
    const exploded = await edit(explodedImagePrompt(layers), [dish], "eclate-01-vue-eclatee.jpg");
    const explodeTask = animate(job.photoUrl, exploded, EXPLODE_MOTION, "eclate.mp4");

    // 2. Chef Ju et le baiser du chef (en parallèle des vues du dessus).
    const voilaTask = (async () => {
      const start = await edit(voilaImagePrompt(), [reference, dish], "eclate-90-et-voila.jpg");
      return animate(start, null, VOILA_MOTION, "et-voila.mp4");
    })();

    // 3. Vues du dessus : contenant vide, puis une couche de plus à chaque image.
    let previous = await edit(topEmptyPrompt(layers), [dish], "dessus-00.jpg", true);
    topViews.push("realiste/dessus-00.jpg");
    for (const [i, layer] of layers.layers.entries()) {
      const file = `dessus-${String(i + 1).padStart(2, "0")}.jpg`;
      previous = await edit(topAddPrompt(layer), [previous, dish], file, true);
      topViews.push(`realiste/${file}`);
    }
    notice("Vues du dessus prêtes");
    [explodeClip, voilaClip] = await Promise.all([explodeTask, voilaTask]);
    notice("Clips prêts");
  }

  // 4. Lèvres de Chef Ju synchronisées sur la voix de Julien (placée au même moment que dans la vidéo).
  const voice = finishing(root).voice;
  if (voice) {
    try {
      const padded = join(assets, "voix-calee.m4a");
      const track = await selectComposition({ serveUrl, id: VOICE_TRACK_ID, inputProps: { voice } });
      await renderMedia({
        composition: track,
        serveUrl,
        codec: "aac",
        outputLocation: padded,
        inputProps: { voice },
      });
      const videoUrl = await falUpload(
        falKey,
        new Uint8Array(await readFile(join(root, "public", voilaClip))),
        "video/mp4",
        "et-voila.mp4",
      );
      const audioUrl = await falUpload(
        falKey,
        new Uint8Array(await readFile(padded)),
        "audio/mp4",
        "voix.m4a",
      );
      const synced = await retry(() =>
        fal.run<VideoResult>(LIPSYNC_MODEL, { video_url: videoUrl, audio_url: audioUrl }, 30 * 60_000),
      );
      await writeFile(join(assets, "et-voila-levres.mp4"), await download(synced.video.url));
      voilaClip = "realiste/et-voila-levres.mp4";
      notice("Lèvres de Chef Ju synchronisées sur la voix");
    } catch (error) {
      const note = error instanceof Error ? error.message : String(error);
      notice(`Synchronisation des lèvres impossible, voix seule : ${note.slice(0, 300)}`);
    }
  }

  serveUrl = await bundle({
    entryPoint: join(root, "src", "video", "index.ts"),
    publicDir: join(root, "public"),
  });
  const props: ExplodedProps = {
    name: job.name,
    hook: job.hook,
    shots: job.shots,
    photoUrl: "static:realiste/photo.jpg",
    handle: "@culinova.recette",
    site: "culinova.fr",
    jacket: process.env.VESTE === "noire" ? "noire" : "blanche",
    music: null,
    ...finishing(root),
    explodeClip,
    topViews,
    layerNames: layers.layers.map((l) => l.name),
    voilaClip,
  };
  const composition = await selectComposition({ serveUrl, id: EXPLODED_ID, inputProps: props });
  await renderMedia({
    composition,
    serveUrl,
    codec: "h264",
    crf: 20,
    pixelFormat: "yuv420p",
    enforceAudioTrack: true,
    outputLocation: join(output, "D-format-eclate.mp4"),
    inputProps: props,
    timeoutInMilliseconds: 120_000,
  });
  await keepClips(assets, output);
  notice("Format « vue éclatée » fabriqué");
}

main().catch((error) => {
  console.error(error);
  const note = error instanceof Error ? error.message : String(error);
  if (process.env.GITHUB_ACTIONS) {
    console.log(`::error title=Vue éclatée::${note.replace(/\r?\n/g, " ").slice(0, 900)}`);
  }
  process.exit(1);
});
