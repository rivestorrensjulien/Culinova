/**
 * Pages publiques des recettes (culinova.fr/recette/<slug>) : liens des réseaux sociaux.
 * Seules les recettes des administrateurs peuvent avoir une page. Elle montre la recette du
 * nom jusqu'aux conseils, jamais le coût, les prix de vente, les marges ni la nutrition :
 * ces données ne quittent pas le serveur (la page reçoit une vue réduite, `PublicRecipe`).
 */
import type { Database } from "@culinova/db";
import * as s from "@culinova/db/schema";
import { and, desc, eq, isNull } from "drizzle-orm";
import { randomBytes } from "node:crypto";
import { platingText } from "@/components/recipe/format";
import { audit } from "./audit";
import { loadRecipeView } from "./generation/view";
import { amountText, stepPlainText } from "./recipe-text";

export const PUBLIC_RECIPE_PATH = "/recette";
/** Page « lien en bio » : les dernières recettes publiques. */
export const PUBLIC_LIST_PATH = "/recettes";

/** Adresse lisible et non devinable : « tostadas-argentines-a-la-palta-k3f9 ». */
export function publicSlug(name: string, random: () => string = () => randomSuffix()): string {
  const base = name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/œ/gi, "oe")
    .replace(/æ/gi, "ae")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean)
    .slice(0, 6)
    .join("-")
    .slice(0, 60)
    .replace(/-+$/, "");
  return `${base || "recette"}-${random()}`;
}

function randomSuffix(): string {
  const alphabet = "abcdefghijkmnpqrstuvwxyz23456789";
  return Array.from(randomBytes(4), (b) => alphabet[b % alphabet.length]).join("");
}

export function publicRecipeUrl(baseUrl: string, slug: string): string {
  return `${baseUrl.replace(/\/$/, "")}${PUBLIC_RECIPE_PATH}/${slug}`;
}

async function adminRecipe(db: Database, adminId: string, recipeId: string) {
  const [row] = await db
    .select({ id: s.recipes.id, name: s.recipeVersions.name })
    .from(s.recipes)
    .innerJoin(s.users, eq(s.users.id, s.recipes.ownerId))
    .innerJoin(s.recipeVersions, eq(s.recipeVersions.id, s.recipes.currentVersionId))
    .where(
      and(
        eq(s.recipes.id, recipeId),
        eq(s.recipes.ownerId, adminId),
        eq(s.users.role, "admin"),
        isNull(s.recipes.deletedAt),
      ),
    );
  return row ?? null;
}

export async function publicSlugFor(db: Database, recipeId: string): Promise<string | null> {
  const [row] = await db
    .select({ slug: s.recipePublicPages.slug })
    .from(s.recipePublicPages)
    .where(eq(s.recipePublicPages.recipeId, recipeId));
  return row?.slug ?? null;
}

/**
 * Crée la page publique d'une recette de l'administrateur (ou renvoie l'adresse existante).
 * Null si la recette n'est pas une recette d'administrateur.
 */
export async function ensurePublicPage(
  db: Database,
  adminId: string,
  recipeId: string,
): Promise<string | null> {
  const existing = await publicSlugFor(db, recipeId);
  if (existing) return existing;
  const recipe = await adminRecipe(db, adminId, recipeId);
  if (!recipe) return null;
  for (let attempt = 0; attempt < 5; attempt++) {
    const slug = publicSlug(recipe.name);
    const [row] = await db
      .insert(s.recipePublicPages)
      .values({ recipeId, slug, createdBy: adminId })
      .onConflictDoNothing()
      .returning({ slug: s.recipePublicPages.slug });
    if (row) {
      await audit(db, { actorId: adminId, action: "recipe.public.on", entity: "recipe", entityId: recipeId });
      return row.slug;
    }
    // Conflit : page créée entre-temps pour cette recette, ou adresse déjà prise (très rare).
    const again = await publicSlugFor(db, recipeId);
    if (again) return again;
  }
  return null;
}

/** Retire la page publique (le lien ne mène plus nulle part). */
export async function removePublicPage(db: Database, adminId: string, recipeId: string): Promise<boolean> {
  if (!(await adminRecipe(db, adminId, recipeId))) return false;
  await db.delete(s.recipePublicPages).where(eq(s.recipePublicPages.recipeId, recipeId));
  await audit(db, { actorId: adminId, action: "recipe.public.off", entity: "recipe", entityId: recipeId });
  return true;
}

/** Ce que la page publique peut montrer : la recette, sans aucune donnée de chiffrage. */
export interface PublicRecipe {
  slug: string;
  name: string;
  description: string | null;
  servings: number;
  difficulty: "easy" | "medium" | "hard" | null;
  prepS: number;
  cookS: number;
  restS: number;
  cuisineLabel: string | null;
  ingredients: Array<{ label: string; amount: string; homemade: boolean }>;
  steps: Array<{ text: string; expected: string | null }>;
  plating: string | null;
  equipment: string[];
  allergens: string[];
  diets: string[];
  tips: string[];
  /** Recadrages de la photo principale (servis par /api/vitrine). */
  photo: { portrait: string | null; landscape: string | null };
  updatedAt: string;
}

async function publicPage(db: Database, where: ReturnType<typeof eq>) {
  const [row] = await db
    .select({
      recipeId: s.recipePublicPages.recipeId,
      slug: s.recipePublicPages.slug,
      ownerId: s.recipes.ownerId,
      createdAt: s.recipePublicPages.createdAt,
    })
    .from(s.recipePublicPages)
    .innerJoin(s.recipes, eq(s.recipes.id, s.recipePublicPages.recipeId))
    .innerJoin(s.users, eq(s.users.id, s.recipes.ownerId))
    .where(and(where, eq(s.users.role, "admin"), isNull(s.recipes.deletedAt)));
  return row ?? null;
}

export async function loadPublicRecipe(db: Database, slug: string): Promise<PublicRecipe | null> {
  if (!/^[a-z0-9-]{3,80}$/.test(slug)) return null;
  const page = await publicPage(db, eq(s.recipePublicPages.slug, slug));
  if (!page) return null;
  const view = await loadRecipeView(db, page.recipeId, page.ownerId);
  if (!view || view.kind !== "dish") return null;
  const format = (name: string) => view.images.current?.formats.find((f) => f.format === name)?.id ?? null;
  return {
    slug: page.slug,
    name: view.name,
    description: view.description,
    servings: view.servings,
    difficulty: view.difficulty,
    prepS: view.prepS,
    cookS: view.cookS,
    restS: view.restS,
    cuisineLabel: view.cuisineLabel,
    ingredients: view.ingredients.map((i) => ({
      label: i.label,
      amount: amountText(i),
      homemade: Boolean(i.base),
    })),
    steps: view.steps.map((step) => ({
      text: stepPlainText(view, step.action),
      expected: step.expectedResult,
    })),
    plating: view.plating ? platingText(view.plating) : null,
    equipment: view.equipment,
    allergens: view.allergens,
    diets: view.diets,
    tips: view.tips,
    photo: { portrait: format("4:5"), landscape: format("16:9") },
    updatedAt: view.versions[0]?.createdAt ?? view.createdAt,
  };
}

export interface PublicRecipeCard {
  slug: string;
  name: string;
  imageId: string | null;
}

/** Recettes publiques, de la plus récente à la plus ancienne (page « lien en bio »). */
export async function listPublicRecipes(db: Database, limit = 30): Promise<PublicRecipeCard[]> {
  const rows = await db
    .select({
      slug: s.recipePublicPages.slug,
      recipeId: s.recipes.id,
      name: s.recipeVersions.name,
      versionId: s.recipeVersions.id,
    })
    .from(s.recipePublicPages)
    .innerJoin(s.recipes, eq(s.recipes.id, s.recipePublicPages.recipeId))
    .innerJoin(s.users, eq(s.users.id, s.recipes.ownerId))
    .innerJoin(s.recipeVersions, eq(s.recipeVersions.id, s.recipes.currentVersionId))
    .where(and(eq(s.users.role, "admin"), isNull(s.recipes.deletedAt), eq(s.recipes.kind, "dish")))
    .orderBy(desc(s.recipePublicPages.createdAt))
    .limit(limit);
  const cards: PublicRecipeCard[] = [];
  for (const row of rows) {
    cards.push({ slug: row.slug, name: row.name, imageId: await portraitOf(db, row.versionId) });
  }
  return cards;
}

/** Recadrage 4:5 prêt de la photo principale d'une version. */
async function portraitOf(db: Database, versionId: string): Promise<string | null> {
  const [source] = await db
    .select({ id: s.recipeImages.id })
    .from(s.recipeImages)
    .where(
      and(
        eq(s.recipeImages.recipeVersionId, versionId),
        eq(s.recipeImages.isPrimary, true),
        eq(s.recipeImages.format, "source"),
      ),
    )
    .orderBy(desc(s.recipeImages.createdAt))
    .limit(1);
  if (!source) return null;
  const [crop] = await db
    .select({ id: s.recipeImages.id })
    .from(s.recipeImages)
    .where(
      and(
        eq(s.recipeImages.sourceImageId, source.id),
        eq(s.recipeImages.format, "4:5"),
        eq(s.recipeImages.status, "ready"),
      ),
    )
    .orderBy(desc(s.recipeImages.createdAt))
    .limit(1);
  return crop?.id ?? null;
}

/**
 * Fichier d'un recadrage servi sans connexion : uniquement une image prête de la version
 * active d'une recette qui a une page publique.
 */
export async function publicImageKey(db: Database, imageId: string): Promise<string | null> {
  const [row] = await db
    .select({ storageKey: s.recipeImages.storageKey })
    .from(s.recipeImages)
    .innerJoin(s.recipes, eq(s.recipes.currentVersionId, s.recipeImages.recipeVersionId))
    .innerJoin(s.recipePublicPages, eq(s.recipePublicPages.recipeId, s.recipes.id))
    .innerJoin(s.users, eq(s.users.id, s.recipes.ownerId))
    .where(
      and(
        eq(s.recipeImages.id, imageId),
        eq(s.recipeImages.status, "ready"),
        eq(s.users.role, "admin"),
        isNull(s.recipes.deletedAt),
      ),
    );
  if (!row?.storageKey) return null;
  // Jamais l'image HD source : seulement ses recadrages.
  const [format] = await db
    .select({ format: s.recipeImages.format })
    .from(s.recipeImages)
    .where(eq(s.recipeImages.id, imageId));
  return format && format.format !== "source" ? row.storageKey : null;
}
