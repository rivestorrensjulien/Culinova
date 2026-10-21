/**
 * Retouche d'un plan filmé de la vidéo réaliste économique, sans refaire le reste (≈ 0,40 €) :
 * nouvelles images de départ et d'arrivée avec une consigne en plus, nouveau clip, puis le
 * passage correspondant est remplacé dans C-version-realiste-economique.mp4.
 *
 *   npm run retouche -- --recette=<id ou nom> --plan=5 --cle=5 --consigne="…" [--precedente=scene-04-image.jpg]
 *
 * Le dossier sortie/comparatif doit contenir la vidéo et les images de la fabrication précédente
 * (branche comparatif-video). Variables : CULINOVA_URL, AGENT_API_KEY, FAL_KEY.
 */
import { bundle } from "@remotion/bundler";
import { renderMedia, renderStill, selectComposition } from "@remotion/renderer";
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { CulinovaClient } from "./culinova.ts";
import { dataUri, download, FalClient } from "./fal.ts";
import { arg, type ImageResult, notice, pickJob, retry, type VideoResult } from "./outils.ts";
import { shotAction } from "./video/actions.ts";
import {
  joinMotions,
  keyPlans,
  motionPrompt,
  NEGATIVE_PROMPT,
  REALISTIC_ID,
  type RealisticProps,
  realisticTimeline,
  REFERENCE_ID,
  sceneEndPrompt,
  sceneStartPrompt,
  IMAGE_MODEL,
  VIDEO_MODEL,
} from "./video/realistic.ts";
import { FPS } from "./video/timeline.ts";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const output = join(root, "sortie", "comparatif");
const assets = join(root, "public", "realiste");
const VIDEO = join(output, "C-version-realiste-economique.mp4");

function ffmpeg(args: string[]) {
  execFileSync("npx", ["remotion", "ffmpeg", "-v", "error", "-y", ...args], { cwd: root, stdio: "inherit" });
}

async function main() {
  const baseUrl = process.env.CULINOVA_URL?.trim().replace(/\/$/, "");
  const apiKey = process.env.AGENT_API_KEY?.trim();
  const falKey = process.env.FAL_KEY?.trim();
  if (!baseUrl || !apiKey || !falKey)
    throw new Error("CULINOVA_URL, AGENT_API_KEY et FAL_KEY sont nécessaires.");
  const plan = Number(arg("plan"));
  const consigne = arg("consigne") ?? "";
  if (!plan || !consigne) throw new Error('Indiquez --plan=N et --consigne="…".');
  if (!existsSync(VIDEO))
    throw new Error("Vidéo économique précédente introuvable (branche comparatif-video).");

  const client = new CulinovaClient(baseUrl, apiKey);
  const fal = new FalClient(falKey);
  const job = await pickJob(client, arg("recette"));
  const script = await client.scenes(job.recipeId);
  const p = plan - 1;
  const scenes = script.plans[p]?.scenes;
  if (!scenes) throw new Error(`Le plan ${plan} n'existe pas (${script.plans.length} plans).`);
  const keys = keyPlans(
    job.shots.map((shot) => shotAction(shot)),
    Number(arg("cle")) || null,
  );
  if (!keys.includes(p))
    throw new Error(`Le plan ${plan} n'est pas un plan filmé (${keys.map((k) => k + 1).join(", ")}).`);
  notice(`Retouche du plan ${plan} : « ${job.shots[p]} »`);

  await rm(assets, { recursive: true, force: true });
  await mkdir(assets, { recursive: true });
  let serveUrl = await bundle({
    entryPoint: join(root, "src", "video", "index.ts"),
    publicDir: join(root, "public"),
  });
  const referenceFile = join(output, "mascotte-reference.png");
  const still = await selectComposition({ serveUrl, id: REFERENCE_ID, inputProps: {} });
  await renderStill({ composition: still, serveUrl, output: referenceFile, inputProps: {} });
  const reference = dataUri(new Uint8Array(await readFile(referenceFile)), "image/png");

  // Image précédente (même cuisine) : fin du plan d'avant, telle que fabriquée la dernière fois.
  const prefix = `scene-${String(plan).padStart(2, "0")}`;
  const before = `scene-${String(plan - 1).padStart(2, "0")}`;
  const files = await readdir(output);
  const previousFile =
    arg("precedente") ??
    files
      .filter((f) => f.startsWith(before) && /(image|fin)\.jpg$/.test(f))
      .sort()
      .pop();
  if (!previousFile) throw new Error(`Image du plan ${plan - 1} introuvable.`);
  const previous = dataUri(new Uint8Array(await readFile(join(output, previousFile))), "image/jpeg");

  const edit = async (prompt: string, inputs: string[], file: string) => {
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
    await writeFile(join(output, file), await download(url));
    return url;
  };
  const first = scenes[0]!;
  const last = scenes[scenes.length - 1]!;
  const start = await edit(
    sceneStartPrompt(script, `${first.start} ${consigne}`, false),
    [reference, previous],
    `${prefix}-1-debut.jpg`,
  );
  const end = await edit(
    sceneEndPrompt(`${last.end} ${consigne}`, false),
    [reference, start],
    `${prefix}-1-fin.jpg`,
  );
  notice("Nouvelles images prêtes, animation…");
  const clip = await retry(() =>
    fal.run<VideoResult>(VIDEO_MODEL, {
      prompt: motionPrompt(`${joinMotions(scenes.map((s) => s.motion))} ${consigne}`),
      start_image_url: start,
      end_image_url: end,
      duration: "5",
      generate_audio: false,
      negative_prompt: NEGATIVE_PROMPT,
    }),
  );
  const clipFile = `clip-${plan}-1.mp4`;
  await writeFile(join(assets, clipFile), await download(clip.video.url));

  // Même déroulé que la vidéo économique : seul le passage du plan est refait, avec son texte.
  const plans: RealisticProps["plans"] = job.shots.map((_, i) =>
    keys.includes(i)
      ? { clips: [i === p ? `realiste/${clipFile}` : "absent.mp4"] }
      : { clips: [], still: "absent.jpg" },
  );
  const props: RealisticProps = {
    name: job.name,
    hook: job.hook,
    shots: job.shots,
    photoUrl: "static:realiste/absent.jpg",
    handle: "@culinova.recette",
    site: "culinova.fr",
    jacket: process.env.VESTE === "noire" ? "noire" : "blanche",
    music: null,
    hookClip: null,
    plans,
  };
  const segment = realisticTimeline(props).find((s) => s.kind === "shot" && s.index === p)!;
  serveUrl = await bundle({
    entryPoint: join(root, "src", "video", "index.ts"),
    publicDir: join(root, "public"),
  });
  const composition = await selectComposition({ serveUrl, id: REALISTIC_ID, inputProps: props });
  const part = join(output, "passage.mp4");
  await renderMedia({
    composition,
    serveUrl,
    codec: "h264",
    crf: 20,
    pixelFormat: "yuv420p",
    enforceAudioTrack: true,
    outputLocation: part,
    inputProps: props,
    frameRange: [segment.from, segment.from + segment.frames - 1],
  });

  // Recollage : avant | nouveau passage | après.
  const from = segment.from / FPS;
  const to = (segment.from + segment.frames) / FPS;
  const head = join(output, "avant.mp4");
  const tail = join(output, "apres.mp4");
  const encode = ["-c:v", "libx264", "-crf", "20", "-pix_fmt", "yuv420p", "-r", String(FPS), "-c:a", "aac"];
  ffmpeg(["-i", VIDEO, "-t", from.toFixed(4), ...encode, head]);
  ffmpeg(["-ss", to.toFixed(4), "-i", VIDEO, ...encode, tail]);
  const list = join(output, "liste.txt");
  await writeFile(list, [head, part, tail].map((f) => `file '${f}'`).join("\n"));
  const result = join(output, "nouvelle.mp4");
  ffmpeg(["-f", "concat", "-safe", "0", "-i", list, ...encode, result]);
  await rename(result, VIDEO);
  for (const f of [head, tail, part, list]) await rm(f, { force: true });
  notice(`Plan ${plan} refait et remplacé dans la vidéo`);
}

main().catch((error) => {
  console.error(error);
  const note = error instanceof Error ? error.message : String(error);
  if (process.env.GITHUB_ACTIONS)
    console.log(`::error title=Retouche::${note.replace(/\r?\n/g, " ").slice(0, 900)}`);
  process.exit(1);
});
