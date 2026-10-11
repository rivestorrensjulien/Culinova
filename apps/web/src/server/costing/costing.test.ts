import { FakeLlmAdapter } from "@culinova/ai";
import * as s from "@culinova/db/schema";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { emptyWizardState, type WizardState } from "@/lib/wizard";
import { createTestUser, hasTestDb, testDb } from "@/test/db";
import { runGeneration } from "../generation/run";
import { startRecipeGeneration } from "../generation/start";
import { loadRecipeView } from "../generation/view";
import { listMyIngredients } from "./ingredients";
import { priceHistoryOf, readPriceInput, savePrice } from "./prices";
import { computeRecipeCost } from "./recipe-cost";

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

/** Crée une recette avec l'IA factice (riz à sushi 300 g, saumon 480 g… pour 4). */
async function recipeFor(userId: string) {
  const db = testDb();
  const [draft] = await db.insert(s.recipeDrafts).values({ userId, state, wizardStep: 9 }).returning();
  const started = await startRecipeGeneration(db, { userId, draftId: draft!.id });
  if (!started.ok) throw new Error(started.reason);
  await runGeneration(db, new FakeLlmAdapter(), started.generationId);
  const [row] = await db.select().from(s.recipeDrafts).where(eq(s.recipeDrafts.id, draft!.id));
  const view = await loadRecipeView(db, row!.recipeId!, userId);
  return view!;
}

describe("saisie d'un prix", () => {
  it("accepte la virgule et refuse les valeurs invalides", () => {
    expect(readPriceInput("9,80")).toBe("9.8000");
    expect(readPriceInput(" 12.5 ")).toBe("12.5000");
    expect(readPriceInput("0")).toBeNull();
    expect(readPriceInput("-3")).toBeNull();
    expect(readPriceInput("abc")).toBeNull();
    expect(readPriceInput("")).toBeNull();
  });
});

describe.skipIf(!hasTestDb)("prix des ingrédients et coût matière", () => {
  it("calcule le coût de la recette à partir des prix saisis et garde l'historique", async () => {
    const db = testDb();
    const user = await createTestUser();
    const recipe = await recipeFor(user.id);

    // Sans prix : rien n'est chiffré, tous les ingrédients sont signalés.
    expect(recipe.cost).toMatchObject({ pricedCount: 0, totalCents: 0 });
    expect(recipe.cost.missing.length).toBe(recipe.cost.lineCount);

    const rice = recipe.ingredients.find((i) => i.label === "Riz à sushi")!;
    const [line] = await db
      .select({ ingredientId: s.recipeIngredients.ingredientId })
      .from(s.recipeIngredients)
      .where(eq(s.recipeIngredients.id, rice.id));
    const riceId = line!.ingredientId!;

    // 300 g de riz à 4,00 €/kg = 1,20 € pour 4, soit 0,30 € par portion.
    expect(
      await savePrice(db, { userId: user.id, ingredientId: riceId, price: "4", supplierName: "Metro" }),
    ).toEqual({ ok: true, price: "4.0000" });
    let cost = await computeRecipeCost(db, user.id, recipe.versionId, recipe.servings);
    expect(cost).toMatchObject({ totalCents: 120, perPortionCents: 30, pricedCount: 1 });
    expect(cost.missing.some((m) => m.label === "Riz à sushi")).toBe(false);

    // Nouveau prix : le coût suit, l'ancien prix reste dans l'historique.
    await savePrice(db, { userId: user.id, ingredientId: riceId, price: "5,00", supplierName: null });
    cost = await computeRecipeCost(db, user.id, recipe.versionId, recipe.servings);
    expect(cost.totalCents).toBe(150);
    const history = await priceHistoryOf(db, user.id, riceId);
    expect(history.map((h) => [h.oldPrice, h.newPrice])).toEqual([
      ["4.0000", "5.0000"],
      [null, "4.0000"],
    ]);

    const rows = await listMyIngredients(db, user.id, { recipeId: recipe.recipeId });
    expect(rows.find((r) => r.id === riceId)).toMatchObject({
      price: "5.0000",
      unit: "kg",
      priceIsOwn: true,
    });
    expect(rows.find((r) => r.name === "Yuzu kosho")).toMatchObject({ price: null, toConfirm: true });

    // Le prix d'une personne ne s'applique pas aux autres.
    const other = await createTestUser();
    const otherRecipe = await recipeFor(other.id);
    expect(otherRecipe.cost.pricedCount).toBe(0);
  });

  it("refuse un prix invalide ou un ingrédient d'une autre personne", async () => {
    const db = testDb();
    const owner = await createTestUser();
    const recipe = await recipeFor(owner.id);
    const yuzu = (await listMyIngredients(db, owner.id, { recipeId: recipe.recipeId })).find(
      (r) => r.name === "Yuzu kosho",
    )!;
    expect(await savePrice(db, { userId: owner.id, ingredientId: yuzu.id, price: "-2" })).toEqual({
      ok: false,
      reason: "invalid",
    });
    const intruder = await createTestUser();
    expect(await savePrice(db, { userId: intruder.id, ingredientId: yuzu.id, price: "30" })).toEqual({
      ok: false,
      reason: "not_found",
    });
  });
});
