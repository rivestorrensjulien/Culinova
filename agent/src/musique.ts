/**
 * Musiques de fond originales (instrumentales, sans voix) composées par Stable Audio 2.5 via
 * fal.ai, usage commercial autorisé : 4 ambiances à écouter et choisir. La musique retenue est
 * enregistrée dans agent/public/musique.mp3 (ou public/musiques/) et mise sous les vidéos.
 *
 *   npm run musique
 *
 * Variables : FAL_KEY (environ 0,20 € par musique). Résultat : sortie/comparatif/musique-1..4.wav.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { download, FalClient } from "./fal.ts";
import { notice, retry } from "./outils.ts";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const output = join(root, "sortie", "comparatif");
const MUSIC_MODEL = "fal-ai/stable-audio-25/text-to-audio";
const COMMON =
  "Instrumental only, no vocals, no singing. Background music for a short cooking video on social media, " +
  "clean mix that leaves room for a voice, steady energy from start to end, ends on a resolved note.";

export const MOODS = [
  "Warm acoustic guitar and ukulele, light hand claps and shaker, sunny and cheerful kitchen mood, 100 BPM.",
  "Smooth lo-fi hip hop beat, warm Rhodes piano, soft bass, subtle vinyl texture, cosy and relaxed, 85 BPM.",
  "Playful French café jazz, accordion melody, upright bass and brushed drums, light and elegant, 120 BPM.",
  "Bright modern pop groove, plucked synths, punchy kick and claps, positive and catchy, 110 BPM.",
];

async function main() {
  const falKey = process.env.FAL_KEY?.trim();
  if (!falKey) throw new Error("FAL_KEY est nécessaire.");
  const fal = new FalClient(falKey);
  await mkdir(output, { recursive: true });
  await Promise.all(
    MOODS.map(async (mood, i) => {
      const result = await retry(() =>
        fal.run<{ audio: { url: string } }>(MUSIC_MODEL, {
          prompt: `${mood} ${COMMON}`,
          seconds_total: 60,
          num_inference_steps: 8,
        }),
      );
      await writeFile(join(output, `musique-${i + 1}.wav`), await download(result.audio.url));
    }),
  );
  notice(`${MOODS.length} musiques composées`);
}

main().catch((error) => {
  console.error(error);
  const note = error instanceof Error ? error.message : String(error);
  if (process.env.GITHUB_ACTIONS) {
    console.log(`::error title=Musique::${note.replace(/\r?\n/g, " ").slice(0, 900)}`);
  }
  process.exit(1);
});
