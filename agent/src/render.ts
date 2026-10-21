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
import { renderMedia, renderStill, selectComposition } from "@remotion/renderer";
import { existsSync } from "node:fs";
import { mkdir, readFile, stat } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { type CarouselJob, CulinovaClient } from "./culinova.ts";
import { finishing } from "./outils.ts";
import { GESTURES_ID } from "./video/actions.ts";
import { CAROUSEL_ID, carouselPages, type CarouselProps, EXAMPLE_CAROUSEL } from "./video/carousel.ts";
import { COMPOSITION_ID, EXAMPLE_PROPS, FPS, timeline, type VideoProps } from "./video/timeline.ts";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const output = join(root, "sortie");

function arg(name: string): string | null {
  const found = process.argv.find((a) => a === `--${name}` || a.startsWith(`--${name}=`));
  if (!found) return null;
  return found.includes("=") ? found.slice(found.indexOf("=") + 1) : "";
}

const started = Date.now();
/** Étape visible dans le résumé de l'exécution GitHub (avec le temps écoulé). */
function notice(message: string) {
  const elapsed = Math.round((Date.now() - started) / 1000);
  console.log(
    process.env.GITHUB_ACTIONS
      ? `::notice title=Agent (${elapsed} s)::${message}`
      : `${elapsed} s · ${message}`,
  );
}

/** Erreur visible dans le résumé de l'exécution GitHub (annotation), en plus du journal. */
function annotate(title: string, note: string) {
  if (process.env.GITHUB_ACTIONS)
    console.log(`::error title=${title}::${note.replace(/\r?\n/g, " ").slice(0, 900)}`);
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

/** Images fixes au milieu de chaque scène (aperçu sans lecteur vidéo). */
async function stills(serveUrl: string, props: VideoProps) {
  const composition = await selectComposition({ serveUrl, id: COMPOSITION_ID, inputProps: props });
  for (const [i, segment] of timeline(props).entries()) {
    const output = join(root, "sortie", `apercu-${String(i).padStart(2, "0")}-${segment.kind}.png`);
    await renderStill({
      composition,
      serveUrl,
      output,
      frame: segment.from + Math.round(segment.frames * 0.7),
      inputProps: props,
      scale: 0.5,
    });
  }
  const gestures = await selectComposition({ serveUrl, id: GESTURES_ID, inputProps: {} });
  await renderStill({
    composition: gestures,
    serveUrl,
    output: join(root, "sortie", "apercu-gestes.png"),
    inputProps: {},
    scale: 0.75,
  });
}

/** Images JPEG du carrousel (une par page), dans l'ordre. */
async function renderCarousel(serveUrl: string, props: CarouselProps, prefix: string): Promise<string[]> {
  const count = carouselPages(props).length;
  const files: string[] = [];
  for (let page = 0; page < count; page++) {
    const inputProps = { ...props, page };
    const composition = await selectComposition({ serveUrl, id: CAROUSEL_ID, inputProps });
    const file = `${prefix}-${String(page + 1).padStart(2, "0")}.jpg`;
    await renderStill({
      composition,
      serveUrl,
      output: file,
      inputProps,
      imageFormat: "jpeg",
      jpegQuality: 90,
    });
    files.push(file);
  }
  return files;
}

async function carousels(
  serveUrl: string,
  client: CulinovaClient,
  jacket: VideoProps["jacket"],
  recipeId?: string,
) {
  const jobs: CarouselJob[] = await client.carouselJobs(recipeId);
  let failures = 0;
  for (const job of jobs) {
    console.log(`Carrousel de « ${job.name} »…`);
    let carouselId: string | null = null;
    try {
      const files = await renderCarousel(
        serveUrl,
        {
          name: job.name,
          servings: job.servings,
          totalMinutes: job.totalMinutes,
          ingredients: job.ingredients,
          steps: job.steps,
          photoUrl: job.photoUrl,
          handle: "@culinova.recette",
          site: "culinova.fr",
          jacket,
          page: 0,
        },
        join(output, `carrousel-${job.recipeId}`),
      );
      notice(`Carrousel « ${job.name} » fabriqué (${files.length} images), envoi…`);
      const target = await client.registerCarousel({
        recipeId: job.recipeId,
        versionId: job.versionId,
        imageId: job.imageId,
        slideCount: files.length,
      });
      carouselId = target.carouselId;
      for (const [index, file] of files.entries()) {
        await client.send(target.uploads[index]!, new Uint8Array(await readFile(file)));
      }
      await client.reportCarousel(target.carouselId, { status: "ready" });
      notice(`Carrousel « ${job.name} » envoyé`);
    } catch (error) {
      failures++;
      const note = error instanceof Error ? error.message : String(error);
      console.error(`  échec : ${note}`);
      annotate(`Carrousel ${job.name}`, note);
      if (carouselId)
        await client
          .reportCarousel(carouselId, { status: "failed", note: note.slice(0, 500) })
          .catch(() => {});
    }
  }
  return failures;
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
    const props: VideoProps = {
      ...EXAMPLE_PROPS,
      photoUrl: "static:exemple.jpg",
      jacket,
      music,
      ...finishing(root),
    };
    await render(serveUrl, props, file);
    console.log(`Vidéo d'exemple : ${file}`);
    if (arg("images") !== null) await stills(serveUrl, props);
    const slides = await renderCarousel(serveUrl, { ...EXAMPLE_CAROUSEL, jacket }, join(output, "carrousel"));
    console.log(`Carrousel d'exemple : ${slides.length} images`);
    return;
  }

  const baseUrl = process.env.CULINOVA_URL?.trim().replace(/\/$/, "");
  const apiKey = process.env.AGENT_API_KEY?.trim();
  if (!baseUrl || !apiKey) throw new Error("CULINOVA_URL et AGENT_API_KEY sont nécessaires.");
  const client = new CulinovaClient(baseUrl, apiKey);
  const jobs = await client.jobs(arg("recette") || undefined);
  if (jobs.length === 0) console.log("Aucune vidéo à fabriquer.");

  let failures = await carousels(serveUrl, client, jacket, arg("recette") || undefined);
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
        ...finishing(root),
      };
      const meta = await render(serveUrl, props, file);
      notice(`Vidéo « ${job.name} » fabriquée (${meta.durationS.toFixed(0)} s), envoi…`);
      const { size } = await stat(file);
      const target = await client.register({
        recipeId: job.recipeId,
        versionId: job.versionId,
        imageId: job.imageId,
        sizeBytes: size,
        ...meta,
      });
      videoId = target.videoId;
      await client.upload(target, new Uint8Array(await readFile(file)));
      await client.report(target.videoId, { status: "ready" });
      notice(`Vidéo « ${job.name} » envoyée (${(size / 1_000_000).toFixed(1)} Mo)`);
    } catch (error) {
      failures++;
      const note = error instanceof Error ? error.message : String(error);
      console.error(`  échec : ${note}`);
      annotate(`Vidéo ${job.name}`, note);
      if (videoId)
        await client.report(videoId, { status: "failed", note: note.slice(0, 500) }).catch(() => {});
    }
  }
  if (failures > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  annotate("Agent", error instanceof Error ? (error.stack ?? error.message) : String(error));
  process.exit(1);
});
