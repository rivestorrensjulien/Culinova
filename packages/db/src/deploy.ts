/**
 * Préparation de la base lors d'une mise en ligne (`pnpm db:deploy`, lancé par Vercel
 * avant chaque build de production) : migrations, données de référence et compte
 * administrateur. Tout est idempotent : relancer ne crée aucun doublon.
 *
 * Les déploiements de prévisualisation (branches) ne touchent jamais à la base.
 */
import { createDb } from "./index";
import { loadRootEnv } from "./env";
import { runMigrations } from "./migrate";
import { ensureAdmin, seed } from "./seed";

loadRootEnv();

const vercelEnv = process.env.VERCEL_ENV;
if (vercelEnv && vercelEnv !== "production") {
  console.log(`ℹ Déploiement « ${vercelEnv} » : la base de données n'est pas modifiée.`);
  process.exit(0);
}

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("✗ DATABASE_URL n'est pas définie : impossible de préparer la base (voir .env.example).");
  process.exit(1);
}

try {
  await runMigrations(url);
  console.log("✓ Tables à jour");
  const db = createDb(url);
  try {
    await seed(db);
    console.log("✓ Données de référence à jour");
    const adminEmail = process.env.ADMIN_EMAIL;
    if (adminEmail) {
      const admin = await ensureAdmin(db, adminEmail);
      console.log(`✓ Compte administrateur ${admin.created ? "créé" : "déjà présent"}`);
    } else {
      console.log("ℹ ADMIN_EMAIL non définie : aucun compte administrateur créé.");
    }
  } finally {
    await db.$client.end();
  }
} catch (error) {
  console.error(`✗ Préparation de la base impossible : ${describeError(error)}`);
  console.error(`  Adresse utilisée : ${describeUrl(url)}`);
  console.error(
    "  Vérifiez DATABASE_URL (adresse « Transaction pooler » de Supabase, port 6543, mot de passe).",
  );
  process.exit(1);
}

/** Message d'erreur, avec la cause réelle renvoyée par PostgreSQL (jamais le mot de passe). */
function describeError(error: unknown): string {
  const messages: string[] = [];
  let current: unknown = error;
  while (current && messages.length < 5) {
    if (current instanceof Error) {
      const code = (current as { code?: unknown }).code;
      messages.push(typeof code === "string" ? `${current.message} [${code}]` : current.message);
      current = current.cause;
    } else {
      messages.push(String(current));
      break;
    }
  }
  return messages.join(" ← cause : ");
}

/** Résumé de l'adresse de connexion, mot de passe masqué, pour repérer une erreur de saisie. */
function describeUrl(raw: string): string {
  try {
    const parsed = new URL(raw.trim());
    const password = decodeURIComponent(parsed.password);
    const hints: string[] = [];
    if (raw !== raw.trim()) hints.push("espaces avant ou après l'adresse");
    if (!password) hints.push("mot de passe absent");
    if (/[[\]]|YOUR-PASSWORD/i.test(password)) hints.push("crochets ou « YOUR-PASSWORD » encore présents");
    return [
      `${parsed.protocol}//${decodeURIComponent(parsed.username)}:****@${parsed.hostname}:${parsed.port || "5432"}${parsed.pathname}`,
      hints.length ? `(attention : ${hints.join(", ")})` : "",
    ]
      .filter(Boolean)
      .join(" ");
  } catch {
    return "illisible (ce n'est pas une adresse postgresql://… valide ; un caractère spécial du mot de passe est peut-être à remplacer)";
  }
}
