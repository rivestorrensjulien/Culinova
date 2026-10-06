/** `pnpm db:seed` : données de référence + compte administrateur (ADMIN_EMAIL). */
import { createDb } from "../index";
import { loadRootEnv } from "../env";
import { ensureAdmin, seed } from "./index";

loadRootEnv();
const db = createDb();
try {
  await seed(db);
  console.log("✓ Données de référence à jour");
  const adminEmail = process.env.ADMIN_EMAIL;
  if (adminEmail) {
    const admin = await ensureAdmin(db, adminEmail);
    console.log(`✓ Administrateur ${adminEmail} ${admin.created ? "créé" : "déjà présent"}`);
  } else {
    console.log("ℹ ADMIN_EMAIL non définie : aucun compte administrateur créé.");
  }
} finally {
  await db.$client.end();
}
