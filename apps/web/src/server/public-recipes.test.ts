/** Pages publiques des recettes : liens des réseaux, sans prix ni marges. */
import { FakeLlmAdapter } from "@culinova/ai";
import * as s from "@culinova/db/schema";
import { eq } from "drizzle-orm";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { emptyWizardState, type WizardState } from "@/lib/wizard";
import { createTestUser, hasTestDb, testDb } from "@/test/db";
import { runGeneration } from "./generation/run";
import { startRecipeGeneration } from "./generation/start";
import { runImageGeneration, startImageGeneration } from "./images/generate";
import { LocalStorage } from "./images/storage";
import {
  ensurePublicPage,
  listPublicRecipes,
  loadPublicRecipe,
  publicImageKey,
  publicSlug,
  publicSlugFor,
  removePublicPage,
} from "./public-recipes";

describe("adresse des pages publiques", () => {
  it("lisible, sans accents, suivie de 4 caractères au hasard", () => {
    expect(publicSlug("Tostadas argentines à la palta, œuf poché et tomate fraîche", () => "k3f9")).toBe(
      "tostadas-argentines-a-la-palta-oeuf-k3f9",
    );
    expect(publicSlug("!!!", () => "abcd")).toBe("recette-abcd");
    expect(publicSlug("Crème brûlée")).toMatch(/^creme-brulee-[a-z2-9]{4}$/);
  });
});

const state: WizardState = {
  ...emptyWizardState("fr"),
  step: 9,
  momentCode: "main",
  influenceCode: "asia",
  regionCode: "east_asia",
  countryIso: "JP",
  cuisineCodes: ["japanese"],
  styleCode: "creative",
  mode: "idea",
  input: "Un plat de saumon",
  servings: 4,
};

async function illustratedRecipe(userId: string) {
  const db = testDb();
  const [draft] = await db.insert(s.recipeDrafts).values({ userId, state, wizardStep: 9 }).returning();
  const started = await startRecipeGeneration(db, { userId, draftId: draft!.id });
  if (!started.ok) throw new Error(started.reason);
  await runGeneration(db, new FakeLlmAdapter(), started.generationId);
  const [row] = await db.select().from(s.recipeDrafts).where(eq(s.recipeDrafts.id, draft!.id));
  const recipeId = row!.recipeId!;
  const photo = await startImageGeneration(db, { userId, recipeId });
  if (!photo.ok) throw new Error(photo.reason);
  const [generation] = await db
    .select()
    .from(s.aiGenerations)
    .where(eq(s.aiGenerations.id, photo.generationId));
  const storage = new LocalStorage(await mkdtemp(join(tmpdir(), "culinova-public-")));
  await runImageGeneration(db, new FakeLlmAdapter(), generation!, { storage });
  return recipeId;
}

describe.skipIf(!hasTestDb)("pages publiques des recettes", () => {
  it("réservées aux recettes des administrateurs, sans aucune donnée de chiffrage", async () => {
    const db = testDb();
    const admin = await createTestUser({ role: "admin" });
    const cook = await createTestUser();
    const recipeId = await illustratedRecipe(admin.id);
    const otherRecipe = await illustratedRecipe(cook.id);

    // Personne d'autre que l'administrateur, et seulement pour ses propres recettes.
    expect(await ensurePublicPage(db, cook.id, otherRecipe)).toBeNull();
    expect(await ensurePublicPage(db, admin.id, otherRecipe)).toBeNull();

    const slug = (await ensurePublicPage(db, admin.id, recipeId))!;
    expect(slug).toMatch(/^[a-z0-9-]+-[a-z2-9]{4}$/);
    // Une seule page par recette : la même adresse à chaque publication.
    expect(await ensurePublicPage(db, admin.id, recipeId)).toBe(slug);

    const page = (await loadPublicRecipe(db, slug))!;
    expect(page.name).toBeTruthy();
    expect(page.ingredients.length).toBeGreaterThan(0);
    expect(page.steps.length).toBeGreaterThan(0);
    expect(page.steps[0]!.text).not.toMatch(/\{\{/);
    // Rien après les conseils : ni coût, ni prix, ni marge, ni nutrition, ni réseaux.
    const json = JSON.stringify(page);
    for (const key of ["cost", "pricing", "Cents", "nutrition", "publishing", "social", "margin", "kcal"]) {
      expect(json).not.toContain(key);
    }

    // La photo (recadrages) est servie sans connexion, jamais l'image HD source.
    expect(page.photo.portrait).toBeTruthy();
    expect(await publicImageKey(db, page.photo.portrait!)).toContain("4x5");
    const [source] = await db
      .select({ id: s.recipeImages.id })
      .from(s.recipeImages)
      .where(eq(s.recipeImages.format, "source"))
      .limit(1);
    expect(await publicImageKey(db, source!.id)).toBeNull();

    expect((await listPublicRecipes(db)).some((r) => r.slug === slug)).toBe(true);

    // Retirée : le lien ne mène plus nulle part, la photo n'est plus servie.
    expect(await removePublicPage(db, cook.id, recipeId)).toBe(false);
    expect(await removePublicPage(db, admin.id, recipeId)).toBe(true);
    expect(await publicSlugFor(db, recipeId)).toBeNull();
    expect(await loadPublicRecipe(db, slug)).toBeNull();
    expect(await publicImageKey(db, page.photo.portrait!)).toBeNull();
  });

  it("refuse les adresses mal formées", async () => {
    expect(await loadPublicRecipe(testDb(), "../../etc")).toBeNull();
    expect(await loadPublicRecipe(testDb(), "inconnue-abcd")).toBeNull();
  });
});
