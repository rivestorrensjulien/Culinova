/** Charge le fichier .env de la racine du dépôt pour les scripts (migrations, seeds). */
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

export function loadRootEnv(): void {
  const path = fileURLToPath(new URL("../../../.env", import.meta.url));
  if (existsSync(path)) process.loadEnvFile(path);
}
