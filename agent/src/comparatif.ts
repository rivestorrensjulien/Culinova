/**
 * Comparatif de deux vidéos pour une même recette (rien n'est envoyé à Culinova) :
 *   A — version animée (Julien dessiné qui cuisine) ;
 *   B — version réaliste (Chef Ju en 3D dans une vraie cuisine) : chaque plan découpé par
 *       Culinova en 1 à 3 scènes, une action chacune, avec image de départ, image d'arrivée
 *       et clip IA de 5 s entre les deux.
 *
 *   npm run comparatif -- --recette=<identifiant ou morceau du nom> [--nouveau=1] [--animee=1 : version animée seule, sans frais]
 *   [--economique=1 [--cle=N]] : accroche + 3 plans filmés (ingrédients, plan N, présentation),
 *   les autres plans en images animées (≈ 1,50 €)
 *
 * Variables : CULINOVA_URL, AGENT_API_KEY, FAL_KEY (environ 0,40 € par scène chez fal.ai).
 * Résultat dans sortie/comparatif/.
 */
import { bundle } from "@remotion/bundler";
import { renderMedia, renderStill, selectComposition } from "@remotion/renderer";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  arg,
  finishing,
  type ImageResult,
  keepClips,
  notice,
  pickJob,
  pool,
  retry,
  type VideoResult,
} from "./outils.ts";
import { CulinovaClient } from "./culinova.ts";
import { dataUri, download, FalClient } from "./fal.ts";
import { shotAction } from "./video/actions.ts";
import {
  hookImagePrompt,
  joinMotions,
  keyPlans,
  IMAGE_MODEL,
  motionPrompt,
  NEGATIVE_PROMPT,
  REALISTIC_ID,
  type RealisticProps,
  REFERENCE_ID,
  sceneEndPrompt,
  sceneStartPrompt,
  VIDEO_MODEL,
} from "./video/realistic.ts";
import { COMPOSITION_ID, type VideoProps } from "./video/timeline.ts";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const output = join(root, "sortie", "comparatif");
const assets = join(root, "public", "realiste");

async function main() {
  const baseUrl = process.env.CULINOVA_URL?.trim().replace(/\/$/, "");
  const apiKey = process.env.AGENT_API_KEY?.trim();
  const falKey = process.env.FAL_KEY?.trim();
  if (!baseUrl || !apiKey) throw new Error("CULINOVA_URL et AGENT_API_KEY sont nécessaires.");
  if (!falKey && arg("animee") !== "1")
    throw new Error("FAL_KEY manquante : ajoutez le secret FAL_KEY dans GitHub.");
  const client = new CulinovaClient(baseUrl, apiKey);
  const fal = new FalClient(falKey ?? "");
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
    ...finishing(root),
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
  if (arg("animee") === "1") return;
  const referenceFile = join(output, "mascotte-reference.png");
  const still = await selectComposition({ serveUrl, id: REFERENCE_ID, inputProps: {} });
  await renderStill({ composition: still, serveUrl, output: referenceFile, inputProps: {} });
  const images = [
    dataUri(new Uint8Array(await readFile(referenceFile)), "image/png"),
    dataUri(photo, "image/jpeg"),
  ];

  // 2. Découpage en scènes (Culinova), puis images de départ et d'arrivée, enchaînées pour garder
  //    la même cuisine d'une scène à l'autre.
  const script = await client.scenes(job.recipeId, arg("nouveau") === "1");
  const sceneCount = script.plans.reduce((sum, plan) => sum + plan.scenes.length, 0);
  notice(`${sceneCount} scènes pour ${job.shots.length} plans`);
  const reference = images[0]!;
  const dish = images[1]!;
  const edit = async (prompt: string, inputs: string[], file: string): Promise<string> => {
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

  const hookImage = await edit(hookImagePrompt(script), [reference, dish], "scene-00-accroche.jpg");
  type Planned = { plan: number; scene: number; start: string; end: string; motion: string };
  const planned: Planned[] = [];
  const stills = new Map<number, string>();
  const economic = arg("economique") === "1";
  const keys = economic
    ? keyPlans(
        job.shots.map((shot) => shotAction(shot)),
        Number(arg("cle")) || null,
      )
    : script.plans.map((_, p) => p);
  if (economic) notice(`Version économique : plans filmés ${keys.map((k) => k + 1).join(", ")}`);
  let previous = hookImage;
  for (const [p, plan] of script.plans.entries()) {
    const plating = p === script.plans.length - 1;
    const extra = plating ? [dish] : [];
    const prefix = `scene-${String(p + 1).padStart(2, "0")}`;
    const first = plan.scenes[0]!;
    const last = plan.scenes[plan.scenes.length - 1]!;
    if (economic && !keys.includes(p)) {
      // Plan non filmé : une image du résultat du plan, dans la même cuisine.
      const url = await edit(
        sceneStartPrompt(script, last.end, plating),
        [reference, previous, ...extra],
        `${prefix}-image.jpg`,
      );
      const file = `still-${String(p + 1).padStart(2, "0")}.jpg`;
      await writeFile(join(assets, file), await download(url));
      stills.set(p, `realiste/${file}`);
      previous = url;
      continue;
    }
    const scenes = economic
      ? [{ ...first, end: last.end, motion: joinMotions(plan.scenes.map((x) => x.motion)) }]
      : plan.scenes;
    for (const [i, scene] of scenes.entries()) {
      const name = `${prefix}-${i + 1}`;
      const start = await edit(
        sceneStartPrompt(script, scene.start, plating),
        [reference, previous, ...extra],
        `${name}-debut.jpg`,
      );
      const end = await edit(
        sceneEndPrompt(scene.end, plating),
        [reference, start, ...extra],
        `${name}-fin.jpg`,
      );
      planned.push({ plan: p, scene: i, start, end, motion: scene.motion });
      previous = end;
    }
  }
  notice("Images des scènes prêtes, animation…");

  // 3. Un clip de 5 s par scène (de l'image de départ à l'image d'arrivée).
  const animate = async (start: string, end: string | null, motion: string, file: string) => {
    const clip = await retry(() =>
      fal.run<VideoResult>(VIDEO_MODEL, {
        prompt: motionPrompt(motion),
        start_image_url: start,
        ...(end ? { end_image_url: end } : {}),
        duration: "5",
        generate_audio: false,
        negative_prompt: NEGATIVE_PROMPT,
      }),
    );
    await writeFile(join(assets, file), await download(clip.video.url));
    return `realiste/${file}`;
  };
  const [hookClip, ...sceneClips] = await pool(
    [
      () => animate(hookImage, null, script.hook.motion, "clip-00.mp4"),
      ...planned.map((s) => () => animate(s.start, s.end, s.motion, `clip-${s.plan + 1}-${s.scene + 1}.mp4`)),
    ],
    4,
  );
  notice("Clips prêts");
  const plans = script.plans.map((_, p) => ({
    clips: planned.flatMap((s, k) => (s.plan === p ? [sceneClips[k]!] : [])),
    still: stills.get(p) ?? null,
  }));

  // 4. Version réaliste (nouveau paquet : les clips doivent faire partie des fichiers publics).
  serveUrl = await bundle({
    entryPoint: join(root, "src", "video", "index.ts"),
    publicDir: join(root, "public"),
  });
  const props: RealisticProps = { ...base, hookClip: hookClip ?? null, plans };
  const realistic = await selectComposition({ serveUrl, id: REALISTIC_ID, inputProps: props });
  await renderMedia({
    composition: realistic,
    serveUrl,
    codec: "h264",
    crf: 20,
    pixelFormat: "yuv420p",
    enforceAudioTrack: true,
    outputLocation: join(output, economic ? "C-version-realiste-economique.mp4" : "B-version-realiste.mp4"),
    inputProps: props,
    timeoutInMilliseconds: 120_000,
  });
  await keepClips(assets, output);
  notice("Version réaliste fabriquée");
}

main().catch((error) => {
  console.error(error);
  const note = error instanceof Error ? error.message : String(error);
  if (process.env.GITHUB_ACTIONS)
    console.log(`::error title=Comparatif::${note.replace(/\r?\n/g, " ").slice(0, 900)}`);
  process.exit(1);
});
