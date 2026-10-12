/** Bibliothèque : cartes, coût par portion, photo, favoris et index Ctrl+K. */
import { FakeLlmAdapter } from "@culinova/ai";
import * as s from "@culinova/db/schema";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { emptyWizardState, type WizardState } from "@/lib/wizard";
import { createTestUser, hasTestDb, testDb } from "@/test/db";
import { savePrice } from "./costing/prices";
import { runGeneration } from "./generation/run";
import { startRecipeGeneration } from "./generation/start";
import { commandIndex, listLibrary, toggleFavorite } from "./library";

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

describe.skipIf(!hasTestDb)("bibliothèque", () => {
  it("présente les recettes en cartes et gère les favoris", async () => {
    const db = testDb();
    const user = await createTestUser();
    const other = await createTestUser();
    const [draft] = await db
      .insert(s.recipeDrafts)
      .values({ userId: user.id, state, wizardStep: 9 })
      .returning();
    const started = await startRecipeGeneration(db, { userId: user.id, draftId: draft!.id });
    if (!started.ok) throw new Error(started.reason);
    await runGeneration(db, new FakeLlmAdapter(), started.generationId);
    const [row] = await db.select().from(s.recipeDrafts).where(eq(s.recipeDrafts.id, draft!.id));
    const recipeId = row!.recipeId!;

    let [card] = await listLibrary(db, user.id);
    expect(card).toMatchObject({
      id: recipeId,
      momentCode: "main",
      momentLabel: "Plat",
      servings: 4,
      totalS: 3300,
      difficulty: "medium",
      costPerPortionCents: null,
      imageId: null,
      favorite: false,
    });
    expect(card!.ingredients).toContain("Riz à sushi");

    // Coût par portion dès qu'un prix est connu : 300 g de riz à 4 €/kg pour 4 = 0,30 €.
    const [rice] = await db
      .select({ ingredientId: s.recipeIngredients.ingredientId })
      .from(s.recipeIngredients)
      .where(eq(s.recipeIngredients.label, "Riz à sushi"));
    await savePrice(db, {
      userId: user.id,
      ingredientId: rice!.ingredientId!,
      price: "4",
      supplierName: null,
    });
    expect(await toggleFavorite(db, other.id, recipeId)).toBeNull();
    expect(await toggleFavorite(db, user.id, recipeId)).toBe(true);
    [card] = await listLibrary(db, user.id);
    expect(card).toMatchObject({ costPerPortionCents: 30, favorite: true });
    expect(await toggleFavorite(db, user.id, recipeId)).toBe(false);

    expect(await listLibrary(db, other.id)).toEqual([]);
    expect((await commandIndex(db, user.id)).map((r) => r.kind)).toEqual(["dish"]);
  });
});
