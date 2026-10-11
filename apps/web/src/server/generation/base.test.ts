/** « Faire maison » : recette de base générée, liée à la ligne, chiffrée et gardée à la régénération. */
import { FakeLlmAdapter } from "@culinova/ai";
import * as s from "@culinova/db/schema";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { emptyWizardState, type WizardState } from "@/lib/wizard";
import { createTestUser, hasTestDb, testDb } from "@/test/db";
import { savePrice } from "../costing/prices";
import { computeRecipeCost } from "../costing/recipe-cost";
import { getMonthlyUsage } from "../quotas";
import { startBaseGeneration } from "./base";
import { runGeneration } from "./run";
import { startRecipeGeneration, startRegeneration } from "./start";
import { listBases, listRecipes, loadRecipeView } from "./view";

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

describe.skipIf(!hasTestDb)("préparations faites maison", () => {
  it("génère la base, la lie à la recette et remplace le prix d'achat par son coût", async () => {
    const db = testDb();
    const ai = new FakeLlmAdapter();
    const user = await createTestUser();
    const other = await createTestUser();

    const [draft] = await db
      .insert(s.recipeDrafts)
      .values({ userId: user.id, state, wizardStep: 9 })
      .returning();
    const started = await startRecipeGeneration(db, { userId: user.id, draftId: draft!.id });
    if (!started.ok) throw new Error(started.reason);
    await runGeneration(db, ai, started.generationId);
    const [row] = await db.select().from(s.recipeDrafts).where(eq(s.recipeDrafts.id, draft!.id));
    const recipeId = row!.recipeId!;

    let view = (await loadRecipeView(db, recipeId, user.id))!;
    const yuzu = view.ingredients.find((i) => i.label === "Yuzu kosho")!;
    expect(yuzu).toMatchObject({ storeBought: true, base: null, pendingBaseGenerationId: null });
    expect(view.ingredients.find((i) => i.label === "Riz à sushi")!.storeBought).toBe(false);
    const usedBefore = (await getMonthlyUsage(db, user.id)).used.recipes;

    // Une autre personne ne peut pas faire maison l'ingrédient d'une recette qui n'est pas la sienne.
    expect(await startBaseGeneration(db, { userId: other.id, lineId: yuzu.id })).toEqual({
      ok: false,
      reason: "not_found",
    });
    const base = await startBaseGeneration(db, { userId: user.id, lineId: yuzu.id });
    if (!base.ok) throw new Error(base.reason);
    expect(await startBaseGeneration(db, { userId: user.id, lineId: yuzu.id })).toEqual({
      ok: false,
      reason: "busy",
    });
    view = (await loadRecipeView(db, recipeId, user.id))!;
    expect(view.ingredients.find((i) => i.id === yuzu.id)!.pendingBaseGenerationId).toBe(base.generationId);

    expect(await runGeneration(db, ai, base.generationId)).toBe("succeeded");
    // Gratuit : le quota de recettes du mois n'a pas bougé.
    expect((await getMonthlyUsage(db, user.id)).used.recipes).toBe(usedBefore);
    const prompt = ai.calls.at(-1)!;
    expect(prompt.promptId).toBe("base.generate@1");
    expect(prompt.user).toContain("Préparation : Yuzu kosho");
    expect(prompt.user).toContain("Quantité nécessaire : 4 g");

    view = (await loadRecipeView(db, recipeId, user.id))!;
    const homemade = view.ingredients.find((i) => i.id === yuzu.id)!;
    expect(homemade.base).toMatchObject({ name: "Yuzu kosho maison", yieldG: 150, prepS: 1200, restS: 3600 });
    expect(await startBaseGeneration(db, { userId: user.id, lineId: yuzu.id })).toEqual({
      ok: false,
      reason: "already_homemade",
    });

    // La base a sa propre page, dans « Mes bases » et non dans « Mes recettes ».
    const baseView = (await loadRecipeView(db, homemade.base!.recipeId, user.id))!;
    expect(baseView).toMatchObject({ kind: "base", servings: 1 });
    expect(baseView.baseInfo).toMatchObject({ yieldG: 150, shelfLifeH: 168 });
    expect(baseView.baseInfo!.usedIn).toEqual([{ recipeId, name: view.name }]);
    expect((await listRecipes(db, user.id)).map((r) => r.id)).toEqual([recipeId]);
    expect((await listBases(db, user.id)).map((b) => b.name)).toEqual(["Yuzu kosho maison"]);

    // Coût : riz 300 g à 4 €/kg = 1,20 € ; base de 150 g à 10 €/kg = 1,50 €, dont 4 g utilisés = 0,04 €.
    const priceOf = async (versionId: string, label: string) => {
      const lines = await db
        .select({ ingredientId: s.recipeIngredients.ingredientId, label: s.recipeIngredients.label })
        .from(s.recipeIngredients)
        .where(eq(s.recipeIngredients.recipeVersionId, versionId));
      return lines.find((l) => l.label === label)!.ingredientId!;
    };
    await savePrice(db, {
      userId: user.id,
      ingredientId: await priceOf(view.versionId, "Riz à sushi"),
      price: "4",
      supplierName: null,
    });
    let cost = await computeRecipeCost(db, user.id, view.versionId, view.servings);
    expect(cost.missing).toContainEqual(expect.objectContaining({ label: "Yuzu kosho", reason: "base" }));
    for (const label of ["Zestes de yuzu", "Piment vert", "Sel fin"]) {
      await savePrice(db, {
        userId: user.id,
        ingredientId: await priceOf(baseView.versionId, label),
        price: "10",
        supplierName: null,
      });
    }
    cost = await computeRecipeCost(db, user.id, view.versionId, view.servings);
    expect(cost.totalCents).toBe(124);
    expect(cost.missing.some((m) => m.label === "Yuzu kosho")).toBe(false);

    // Régénération : la nouvelle version garde le yuzu kosho fait maison.
    const regen = await startRegeneration(db, { userId: user.id, recipeId });
    if (!regen.ok) throw new Error(regen.reason);
    await runGeneration(db, ai, regen.generationId);
    view = (await loadRecipeView(db, recipeId, user.id))!;
    expect(view.versionNo).toBe(2);
    expect(view.ingredients.find((i) => i.label === "Yuzu kosho")!.base?.name).toBe("Yuzu kosho maison");
  });
});
