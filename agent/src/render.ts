/**
 * Fabrique les vidéos des recettes « à publier » et les envoie à Culinova.
 *
 *   npm run exemple                 → sortie/exemple.mp4 (recette d'exemple, sans Culinova)
 *   npm run rendre                  → toutes les recettes dont la vidéo manque
 *   npm run rendre -- --recette=ID  → une recette précise (nouvelle vidéo)
 *
 * Variables : CULINOVA_URL (ex. https://culinova.fr), AGENT_API_KEY, VESTE (blanche | noire).
 */
import { bundle } from "@remotion/bundler";
import { renderMedia, selectComposition } from "@remotion/renderer";
import { existsSync } from "node:fs";
import { mkdir, readFile, stat } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { CulinovaClient } from "./culinova.ts";
import { COMPOSITION_ID, EXAMPLE_PROPS, FPS, type VideoProps } from "./video/timeline.ts";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const output = join(root, "sortie");

function arg(name: string): string | null {
  const found = process.argv.find((a) => a === `--${name}` || a.startsWith(`--${name}=`));
  if (!found) return null;
  return found.includes("=") ? found.slice(found.indexOf("=") + 1) : "";
}

async function render(serveUrl: string, props: VideoProps, file: string) {
  const composition = await selectComposition({ serveUrl, id: COMPOSITION_ID, inputProps: props });
  await renderMedia({
    composition,
    serveUrl,
    codec: "h264",
    crf: 20,
    pixelFormat: "yuv420p",
    // Instagram refuse parfois une vidéo sans piste audio : piste silencieuse si pas de musique.
    enforceAudioTrack: true,
    outputLocation: file,
    inputProps: props,
    timeoutInMilliseconds: 60_000,
  });
  return {
    durationS: composition.durationInFrames / FPS,
    width: composition.width,
    height: composition.height,
  };
}

async function main() {
  await mkdir(output, { recursive: true });
  const music = existsSync(join(root, "public", "musique.mp3")) ? "musique.mp3" : null;
  const jacket = process.env.VESTE === "noire" ? "noire" : "blanche";
  console.log("Préparation du studio vidéo…");
  const serveUrl = await bundle({
    entryPoint: join(root, "src", "video", "index.ts"),
    publicDir: join(root, "public"),
  });

  if (arg("exemple") !== null) {
    const file = join(output, "exemple.mp4");
    await render(serveUrl, { ...EXAMPLE_PROPS, jacket, music }, file);
    console.log(`Vidéo d'exemple : ${file}`);
    return;
  }

  const baseUrl = process.env.CULINOVA_URL?.trim().replace(/\/$/, "");
  const apiKey = process.env.AGENT_API_KEY?.trim();
  if (!baseUrl || !apiKey) throw new Error("CULINOVA_URL et AGENT_API_KEY sont nécessaires.");
  const client = new CulinovaClient(baseUrl, apiKey);
  const jobs = await client.jobs(arg("recette") || undefined);
  if (jobs.length === 0) {
    console.log("Aucune vidéo à fabriquer.");
    return;
  }

  let failures = 0;
  for (const job of jobs) {
    const file = join(output, `${job.recipeId}.mp4`);
    console.log(`Vidéo de « ${job.name} » (${job.shots.length} plans)…`);
    let videoId: string | null = null;
    try {
      const props: VideoProps = {
        name: job.name,
        hook: job.hook,
        shots: job.shots,
        photoUrl: job.photoUrl,
        handle: "@culinova.recette",
        site: "culinova.fr",
        jacket,
        music,
      };
      const meta = await render(serveUrl, props, file);
      const { size } = await stat(file);
      const target = await client.register({
        recipeId: job.recipeId,
        versionId: job.versionId,
        sizeBytes: size,
        ...meta,
      });
      videoId = target.videoId;
      await client.upload(target, new Uint8Array(await readFile(file)));
      await client.report(target.videoId, { status: "ready" });
      console.log(`  envoyée (${(size / 1_000_000).toFixed(1)} Mo, ${meta.durationS.toFixed(1)} s)`);
    } catch (error) {
      failures++;
      const note = error instanceof Error ? error.message : String(error);
      console.error(`  échec : ${note}`);
      if (videoId)
        await client.report(videoId, { status: "failed", note: note.slice(0, 500) }).catch(() => {});
    }
  }
  if (failures > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
