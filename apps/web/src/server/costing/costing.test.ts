import { FakeLlmAdapter, PRICE_ESTIMATE_PROMPT_VERSION } from "@culinova/ai";
import * as s from "@culinova/db/schema";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { emptyWizardState, type WizardState } from "@/lib/wizard";
import { createTestUser, hasTestDb, testDb } from "@/test/db";
import { runGeneration } from "../generation/run";
import { startRecipeGeneration } from "../generation/start";
import { loadRecipeView } from "../generation/view";
import { estimateMissingPrices, estimatePrices, unpricedIngredientIds } from "./estimate";
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

describe.skipIf(!hasTestDb)("estimation automatique des prix manquants", () => {
  it("chiffre la recette avec des prix estimés, à confirmer, sans écraser un prix saisi", async () => {
    const db = testDb();
    const user = await createTestUser();
    const recipe = await recipeFor(user.id);
    const rice = recipe.ingredients.find((i) => i.label === "Riz à sushi")!;
    const [line] = await db
      .select({ ingredientId: s.recipeIngredients.ingredientId })
      .from(s.recipeIngredients)
      .where(eq(s.recipeIngredients.id, rice.id));
    const riceId = line!.ingredientId!;
    // Un prix déjà saisi n'est jamais remplacé par une estimation.
    await savePrice(db, { userId: user.id, ingredientId: riceId, price: "6" });

    const before = await unpricedIngredientIds(db, user.id, recipe.versionId);
    expect(before).not.toContain(riceId);
    const result = await estimateMissingPrices(db, new FakeLlmAdapter(), user.id, recipe.versionId);
    expect(result).toEqual({ ok: true, saved: before.length });

    const cost = await computeRecipeCost(db, user.id, recipe.versionId, recipe.servings);
    expect(cost.pricedCount).toBeGreaterThan(1);
    expect(cost.estimated.length).toBeGreaterThan(0);
    expect(cost.estimated.length).toBeLessThanOrEqual(before.length);
    expect(cost.estimated.some((e) => e.label === "Riz à sushi")).toBe(false);
    const prices = await priceHistoryOf(db, user.id, riceId);
    expect(prices[0]).toMatchObject({ newPrice: "6.0000", source: "manual" });

    // Rien à refaire ensuite ; confirmer un prix (l'enregistrer) le sort des estimations.
    expect(await unpricedIngredientIds(db, user.id, recipe.versionId)).toEqual([]);
    const confirmedId = cost.estimated[0]!.ingredientId!;
    const row = (await listMyIngredients(db, user.id, { recipeId: recipe.recipeId })).find(
      (r) => r.id === confirmedId,
    )!;
    expect(row.priceEstimated).toBe(true);
    await savePrice(db, { userId: user.id, ingredientId: confirmedId, price: row.price! });
    const after = await computeRecipeCost(db, user.id, recipe.versionId, recipe.servings);
    expect(after.estimated.length).toBe(cost.estimated.length - 1);
  });

  it("estime pendant la génération quand l'application le demande", async () => {
    const db = testDb();
    const user = await createTestUser();
    const [draft] = await db
      .insert(s.recipeDrafts)
      .values({ userId: user.id, state, wizardStep: 9 })
      .returning();
    const started = await startRecipeGeneration(db, { userId: user.id, draftId: draft!.id });
    if (!started.ok) throw new Error(started.reason);
    await runGeneration(db, new FakeLlmAdapter(), started.generationId, { estimatePrices: true });
    const [row] = await db.select().from(s.recipeDrafts).where(eq(s.recipeDrafts.id, draft!.id));
    const view = (await loadRecipeView(db, row!.recipeId!, user.id))!;
    expect(view.cost.missing.filter((m) => m.reason === "price")).toEqual([]);
    expect(view.cost.estimated.length).toBeGreaterThan(0);
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

  it("propose des prix estimés par l'IA sans rien enregistrer", async () => {
    const db = testDb();
    const user = await createTestUser();
    const recipe = await recipeFor(user.id);
    const rows = await listMyIngredients(db, user.id, { recipeId: recipe.recipeId });
    const ai = new FakeLlmAdapter();

    const result = await estimatePrices(
      db,
      ai,
      user.id,
      rows.map((r) => r.id),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.proposals).toHaveLength(rows.length);
    const rice = rows.find((r) => r.name === "Riz à sushi")!;
    expect(result.proposals.find((p) => p.ingredientId === rice.id)).toMatchObject({ price: "4.0000" });
    // Le prompt n'envoie que des identifiants courts, jamais les identifiants internes.
    expect(ai.calls[0]!.promptId).toBe(PRICE_ESTIMATE_PROMPT_VERSION);
    expect(ai.calls[0]!.user).toContain("- p1 · ");
    expect(ai.calls[0]!.user).not.toContain(rice.id);

    // Rien n'est enregistré tant que la personne ne valide pas.
    const after = await computeRecipeCost(db, user.id, recipe.versionId, recipe.servings);
    expect(after.pricedCount).toBe(0);
    const [generation] = await db
      .select()
      .from(s.aiGenerations)
      .where(eq(s.aiGenerations.kind, "price_estimate"))
      .orderBy(s.aiGenerations.createdAt);
    expect(generation).toBeDefined();
    expect(await estimatePrices(db, ai, user.id, [])).toEqual({ ok: false, reason: "empty" });
  });
});
