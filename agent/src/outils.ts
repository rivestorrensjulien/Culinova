/** Outils partagés par le comparatif et la retouche d'une scène (vidéo réaliste). */
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { copyFile, mkdir, readdir } from "node:fs/promises";
import { join } from "node:path";
import type { CulinovaClient, VideoJob } from "./culinova.ts";

/**
 * Fin des vidéos : voix de Julien (public/voix/et-voila.mp3) et Chef Ju en 3D
 * (public/mascotte-3d.png), quand ces fichiers sont présents.
 */
export function finishing(root: string): { voice: string | null; endMascot: string | null } {
  const has = (file: string) => existsSync(join(root, "public", file));
  return {
    voice: has("voix/et-voila.mp3") ? "voix/et-voila.mp3" : null,
    endMascot: has("mascotte-3d.png") ? "mascotte-3d.png" : null,
  };
}

export function arg(name: string): string | null {
  const found = process.argv.find((a) => a.startsWith(`--${name}=`));
  return found ? found.slice(found.indexOf("=") + 1).trim() : null;
}

export function notice(message: string) {
  console.log(process.env.GITHUB_ACTIONS ? `::notice title=Comparatif::${message}` : message);
}

export const simplify = (text: string) => text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export async function pickJob(client: CulinovaClient, wanted: string | null): Promise<VideoJob> {
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
export async function pool<T>(tasks: Array<() => Promise<T>>, limit: number): Promise<T[]> {
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

/** Un second essai si fal.ai échoue (file chargée, erreur passagère). */
export async function retry<T>(task: () => Promise<T>): Promise<T> {
  try {
    return await task();
  } catch (error) {
    console.error(`  nouvel essai : ${error instanceof Error ? error.message : String(error)}`);
    return task();
  }
}

export type ImageResult = { images: Array<{ url: string }> };
export type VideoResult = { video: { url: string } };

/** Garde les clips IA avec le résultat (sous-dossier « clips ») : une retouche n'a pas à les refaire. */
export async function keepClips(assets: string, output: string): Promise<void> {
  const target = join(output, "clips");
  await mkdir(target, { recursive: true });
  for (const file of await readdir(assets)) {
    if (file.endsWith(".mp4")) await copyFile(join(assets, file), join(target, file));
  }
}

/** ffmpeg fourni par Remotion (pas besoin de l'installer). */
export function ffmpeg(root: string, args: string[]): void {
  execFileSync("npx", ["remotion", "ffmpeg", "-v", "error", "-y", ...args], { cwd: root, stdio: "inherit" });
}
