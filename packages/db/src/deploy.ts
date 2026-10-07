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
  const message = error instanceof Error ? error.message : String(error);
  console.error(`✗ Préparation de la base impossible : ${message}`);
  console.error(
    "  Vérifiez DATABASE_URL (adresse « Transaction pooler » de Supabase, port 6543, mot de passe).",
  );
  process.exit(1);
}
