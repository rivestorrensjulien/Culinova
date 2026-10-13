/** Vitrine de la page d'accueil : photos choisies par l'administrateur, recette racontée. */
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
import { getShowcase, getShowcaseStory, isInShowcase, setShowcase } from "./showcase";

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
  const storage = new LocalStorage(await mkdtemp(join(tmpdir(), "culinova-showcase-")));
  await runImageGeneration(db, new FakeLlmAdapter(), generation!, { storage });
  return recipeId;
}

describe.skipIf(!hasTestDb)("vitrine de la page d'accueil", () => {
  it("montre les photos choisies par l'administrateur et raconte la première recette", async () => {
    const db = testDb();
    const admin = await createTestUser({ role: "admin" });
    const cook = await createTestUser();
    const recipeId = await illustratedRecipe(admin.id);
    const otherRecipe = await illustratedRecipe(cook.id);

    // Une personne non administratrice ne peut rien mettre en vitrine.
    expect(await setShowcase(db, cook.id, otherRecipe, true)).toBe(false);
    expect(await setShowcase(db, admin.id, recipeId, true)).toBe(true);
    expect(await isInShowcase(db, recipeId)).toBe(true);

    const showcase = await getShowcase(db);
    const item = showcase.find((i) => i.recipeId === recipeId);
    expect(item).toBeDefined();
    expect(item!.storageKey).toContain("4x5");

    const story = (await getShowcaseStory(db, item!))!;
    expect(story).toMatchObject({ recipeId, idea: "Un plat de saumon", servings: 4 });
    expect(story.ingredients.length).toBeGreaterThan(0);
    expect(story.steps[0]).not.toMatch(/\{\{/);

    expect(await setShowcase(db, admin.id, recipeId, false)).toBe(true);
    expect((await getShowcase(db)).some((i) => i.recipeId === recipeId)).toBe(false);
  });
});
