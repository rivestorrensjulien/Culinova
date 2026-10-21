/**
 * Envoie à Culinova une vidéo du comparatif (sortie/comparatif, branche comparatif-video) comme
 * vidéo de la recette : l'administrateur la retrouve dans l'encart « Publication sur les réseaux »
 * et la publie après validation. Rien n'est publié ici.
 *
 *   npm run envoyer -- --recette=<identifiant ou morceau du nom> [--fichier=D-format-eclate.mp4]
 *
 * Variables : CULINOVA_URL, AGENT_API_KEY.
 */
import { getVideoMetadata } from "@remotion/renderer";
import { readFile, stat } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { CulinovaClient } from "./culinova.ts";
import { arg, notice, pickJob } from "./outils.ts";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const output = join(root, "sortie", "comparatif");

async function main() {
  const baseUrl = process.env.CULINOVA_URL?.trim().replace(/\/$/, "");
  const apiKey = process.env.AGENT_API_KEY?.trim();
  if (!baseUrl || !apiKey) throw new Error("CULINOVA_URL et AGENT_API_KEY sont nécessaires.");
  const client = new CulinovaClient(baseUrl, apiKey);
  const job = await pickJob(client, arg("recette"));
  const file = join(output, arg("fichier") || "D-format-eclate.mp4");
  const meta = await getVideoMetadata(file);
  const { size } = await stat(file);
  const target = await client.register({
    recipeId: job.recipeId,
    versionId: job.versionId,
    imageId: job.imageId,
    durationS: meta.durationInSeconds ?? 0,
    width: meta.width ?? 1080,
    height: meta.height ?? 1920,
    sizeBytes: size,
  });
  try {
    await client.upload(target, new Uint8Array(await readFile(file)));
    await client.report(target.videoId, { status: "ready" });
  } catch (error) {
    const note = error instanceof Error ? error.message : String(error);
    await client.report(target.videoId, { status: "failed", note: note.slice(0, 500) }).catch(() => {});
    throw error;
  }
  notice(
    `Vidéo envoyée à Culinova pour « ${job.name} » (${(size / 1_000_000).toFixed(1)} Mo) : à valider dans la recette`,
  );
}

main().catch((error) => {
  console.error(error);
  const note = error instanceof Error ? error.message : String(error);
  if (process.env.GITHUB_ACTIONS) {
    console.log(`::error title=Envoi::${note.replace(/\r?\n/g, " ").slice(0, 900)}`);
  }
  process.exit(1);
});
