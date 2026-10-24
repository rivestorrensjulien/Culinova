/**
 * Agent automatique (tâche GitHub « Vidéos des recettes ») : fabrique ce qui manque aux recettes
 * « à publier » (formats courts validés par Julien le 24/10) :
 *   1. les carrousels Instagram manquants (gratuits) ;
 *   2. la vidéo courte d'UNE recette par passage (≈ 1,20 € chez fal.ai), dans le format choisi
 *      d'après le plat ou demandé par l'administrateur (vue éclatée, coupe, vue du dessus, geste) :
 *      photo → cœur de la vidéo → photo finale → Chef Ju, baiser du chef et « Et voilà ! » avec la
 *      voix de Julien. La recette suivante part au passage suivant (30 min).
 * Un échec est signalé à Culinova (la recette n'est plus retentée après trois échecs : pas de
 * dépenses en boucle). Sans FAL_KEY, repli sur la vidéo animée (gratuite), signalé dans le résumé.
 *
 *   npm run auto [-- --recette=<identifiant ou morceau du nom> [--format=eclate|coupe|dessus|geste]]
 */
import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { CulinovaClient } from "./culinova.ts";
import { arg, pickJob } from "./outils.ts";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function notice(message: string) {
  console.log(process.env.GITHUB_ACTIONS ? `::notice title=Agent::${message}` : message);
}

function annotate(title: string, note: string) {
  console.log(
    process.env.GITHUB_ACTIONS
      ? `::error title=${title}::${note.replace(/\r?\n/g, " ").slice(0, 900)}`
      : note,
  );
}

/** Lance un script du dossier agent/ ; renvoie true s'il a réussi. */
function run(script: string, args: string[]): boolean {
  const result = spawnSync("npx", ["tsx", `src/${script}`, ...args], { cwd: root, stdio: "inherit" });
  return result.status === 0;
}

async function main() {
  const baseUrl = process.env.CULINOVA_URL?.trim().replace(/\/$/, "");
  const apiKey = process.env.AGENT_API_KEY?.trim();
  if (!baseUrl || !apiKey) throw new Error("CULINOVA_URL et AGENT_API_KEY sont nécessaires.");
  const client = new CulinovaClient(baseUrl, apiKey);
  const wanted = arg("recette");
  let failed = false;

  // Recette demandée (identifiant ou morceau du nom) : identifiant retrouvé d'abord.
  const job = wanted ? await pickJob(client, wanted) : (await client.jobs())[0];

  // 1. Carrousels manquants (sans la vidéo).
  if (!run("render.ts", wanted && job ? ["--carrousel", `--recette=${job.recipeId}`] : ["--carrousel"]))
    failed = true;

  // 2. Vidéo d'une recette.
  if (!job) {
    console.log("Aucune vidéo à fabriquer.");
    if (failed) process.exitCode = 1;
    return;
  }
  if (!process.env.FAL_KEY?.trim()) {
    annotate("Vidéo courte", "FAL_KEY absente : vidéo animée fabriquée à la place (format provisoire).");
    if (!run("render.ts", [`--recette=${job.recipeId}`])) process.exitCode = 1;
    return;
  }
  notice(`Vidéo courte de « ${job.name} »…`);
  const ok =
    run("eclate.ts", [
      `--recette=${job.recipeId}`,
      ...(arg("format") ? [`--format=${arg("format")}`] : []),
    ]) && run("envoyer.ts", [`--recette=${job.recipeId}`, "--fichier=D-format-eclate.mp4"]);
  if (ok) {
    notice(`Vidéo de « ${job.name} » envoyée à Culinova (à valider)`);
    if (failed) process.exitCode = 1;
    return;
  }
  // Échec signalé à Culinova : compte dans la limite de trois essais par recette.
  const note = "Fabrication de la vidéo impossible (voir la tâche GitHub « Vidéos des recettes »).";
  try {
    const target = await client.register({
      recipeId: job.recipeId,
      versionId: job.versionId,
      imageId: job.imageId,
      durationS: 1,
      width: 1080,
      height: 1920,
      sizeBytes: 1,
    });
    await client.report(target.videoId, { status: "failed", note });
  } catch (error) {
    console.error(error);
  }
  annotate(`Vidéo ${job.name}`, note);
  process.exitCode = 1;
}

main().catch((error) => {
  annotate("Agent", error instanceof Error ? (error.stack ?? error.message) : String(error));
  process.exit(1);
});
