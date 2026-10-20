/**
 * Comparatif de deux vidéos pour une même recette (rien n'est envoyé à Culinova) :
 *   A — version animée (Julien dessiné qui cuisine) ;
 *   B — version réaliste (Chef Ju en 3D dans une vraie cuisine, un clip vidéo IA par plan).
 *
 *   npm run comparatif -- --recette=<identifiant ou morceau du nom>
 *
 * Variables : CULINOVA_URL, AGENT_API_KEY, FAL_KEY (environ 3 € par vidéo réaliste chez fal.ai).
 * Résultat dans sortie/comparatif/.
 */
import { bundle } from "@remotion/bundler";
import { renderMedia, renderStill, selectComposition } from "@remotion/renderer";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { CulinovaClient, type VideoJob } from "./culinova.ts";
import { dataUri, download, FalClient } from "./fal.ts";
import { shotAction } from "./video/actions.ts";
import {
  gesture,
  hookImagePrompt,
  IMAGE_MODEL,
  motionPrompt,
  NEGATIVE_PROMPT,
  REALISTIC_ID,
  type RealisticProps,
  REFERENCE_ID,
  shotImagePrompt,
  VIDEO_MODEL,
} from "./video/realistic.ts";
import { COMPOSITION_ID, type VideoProps } from "./video/timeline.ts";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const output = join(root, "sortie", "comparatif");
const assets = join(root, "public", "realiste");

function arg(name: string): string | null {
  const found = process.argv.find((a) => a.startsWith(`--${name}=`));
  return found ? found.slice(found.indexOf("=") + 1).trim() : null;
}

function notice(message: string) {
  console.log(process.env.GITHUB_ACTIONS ? `::notice title=Comparatif::${message}` : message);
}

const simplify = (text: string) => text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

async function pickJob(client: CulinovaClient, wanted: string | null): Promise<VideoJob> {
  const uuid = /^[0-9a-f-]{36}$/i;
  let recipeId = wanted && uuid.test(wanted) ? wanted : null;
  if (!recipeId) {
    const queue = await client.queue();
    const found = wanted ? queue.find((r) => simplify(r.name).includes(simplify(wanted))) : queue[0];
    if (!found) {
      const names = queue.map((r) => r.name).join(" · ") || "aucune";
      throw new Error(`Recette introuvable (« ${wanted ?? ""} »). Recettes à publier : ${names}`);
    }
    recipeId = found.recipeId;
  }
  const [job] = await client.jobs(recipeId);
  if (!job) throw new Error("Cette recette n'a pas de script TikTok ou pas de photo 9:16.");
  return job;
}

/** Exécute les tâches avec au plus `limit` en parallèle. */
async function pool<T>(tasks: Array<() => Promise<T>>, limit: number): Promise<T[]> {
  const results: T[] = new Array(tasks.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, tasks.length) }, async () => {
      while (next < tasks.length) {
        const i = next++;
        results[i] = await tasks[i]!();
      }
    }),
  );
  return results;
}

type ImageResult = { images: Array<{ url: string }> };
type VideoResult = { video: { url: string } };

async function main() {
  const baseUrl = process.env.CULINOVA_URL?.trim().replace(/\/$/, "");
  const apiKey = process.env.AGENT_API_KEY?.trim();
  const falKey = process.env.FAL_KEY?.trim();
  if (!baseUrl || !apiKey) throw new Error("CULINOVA_URL et AGENT_API_KEY sont nécessaires.");
  if (!falKey) throw new Error("FAL_KEY manquante : ajoutez le secret FAL_KEY dans GitHub.");
  const client = new CulinovaClient(baseUrl, apiKey);
  const fal = new FalClient(falKey);
  const jacket = process.env.VESTE === "noire" ? "noire" : "blanche";

  const job = await pickJob(client, arg("recette"));
  notice(`Recette : « ${job.name} » (${job.shots.length} plans)`);
  await rm(assets, { recursive: true, force: true });
  await mkdir(assets, { recursive: true });
  await mkdir(output, { recursive: true });
  const photo = await download(job.photoUrl);
  await writeFile(join(assets, "photo.jpg"), photo);

  const base: VideoProps = {
    name: job.name,
    hook: job.hook,
    shots: job.shots,
    photoUrl: "static:realiste/photo.jpg",
    handle: "@culinova.recette",
    site: "culinova.fr",
    jacket,
    music: null,
  };

  // 1. Version animée + image de référence de la mascotte.
  let serveUrl = await bundle({
    entryPoint: join(root, "src", "video", "index.ts"),
    publicDir: join(root, "public"),
  });
  const animated = await selectComposition({ serveUrl, id: COMPOSITION_ID, inputProps: base });
  await renderMedia({
    composition: animated,
    serveUrl,
    codec: "h264",
    crf: 20,
    pixelFormat: "yuv420p",
    enforceAudioTrack: true,
    outputLocation: join(output, "A-version-animee.mp4"),
    inputProps: base,
  });
  notice("Version animée fabriquée");
  const referenceFile = join(output, "mascotte-reference.png");
  const reference = await selectComposition({ serveUrl, id: REFERENCE_ID, inputProps: {} });
  await renderStill({ composition: reference, serveUrl, output: referenceFile, inputProps: {} });
  const images = [
    dataUri(new Uint8Array(await readFile(referenceFile)), "image/png"),
    dataUri(photo, "image/jpeg"),
  ];

  // 2. Une image de départ réaliste par scène (accroche + plans), puis un clip de 5 s chacune.
  const scenes = [
    { prompt: hookImagePrompt(job.name), motion: "presents the finished dish proudly, smiling" },
    ...job.shots.map((plan) => {
      const action = shotAction(plan);
      return { prompt: shotImagePrompt(job.name, plan, action), motion: gesture(action) };
    }),
  ];
  const clips = await pool(
    scenes.map((scene, i) => async () => {
      const name = String(i).padStart(2, "0");
      const still = await fal.run<ImageResult>(IMAGE_MODEL, {
        prompt: scene.prompt,
        image_urls: images,
        aspect_ratio: "9:16",
        output_format: "jpeg",
        num_images: 1,
      });
      const imageUrl = still.images[0]?.url;
      if (!imageUrl) throw new Error(`Scène ${i} : pas d'image`);
      await writeFile(join(output, `scene-${name}.jpg`), await download(imageUrl));
      notice(`Image de la scène ${i} prête, animation…`);
      const clip = await fal.run<VideoResult>(VIDEO_MODEL, {
        prompt: motionPrompt(scene.motion),
        start_image_url: imageUrl,
        duration: "5",
        generate_audio: false,
        negative_prompt: NEGATIVE_PROMPT,
      });
      await writeFile(join(assets, `clip-${name}.mp4`), await download(clip.video.url));
      notice(`Clip de la scène ${i} prêt`);
      return `realiste/clip-${name}.mp4`;
    }),
    4,
  );

  // 3. Version réaliste (nouveau paquet : les clips doivent faire partie des fichiers publics).
  serveUrl = await bundle({
    entryPoint: join(root, "src", "video", "index.ts"),
    publicDir: join(root, "public"),
  });
  const props: RealisticProps = { ...base, clips };
  const realistic = await selectComposition({ serveUrl, id: REALISTIC_ID, inputProps: props });
  await renderMedia({
    composition: realistic,
    serveUrl,
    codec: "h264",
    crf: 20,
    pixelFormat: "yuv420p",
    enforceAudioTrack: true,
    outputLocation: join(output, "B-version-realiste.mp4"),
    inputProps: props,
    timeoutInMilliseconds: 120_000,
  });
  notice("Version réaliste fabriquée");
}

main().catch((error) => {
  console.error(error);
  const note = error instanceof Error ? error.message : String(error);
  if (process.env.GITHUB_ACTIONS)
    console.log(`::error title=Comparatif::${note.replace(/\r?\n/g, " ").slice(0, 900)}`);
  process.exit(1);
});
