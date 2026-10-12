/** Nutrition de bout en bout : correspondances proposées par l'IA, validation, calcul. */
import { FakeLlmAdapter } from "@culinova/ai";
import * as s from "@culinova/db/schema";
import { and, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { emptyWizardState, type WizardState } from "@/lib/wizard";
import { createTestUser, hasTestDb, testDb } from "@/test/db";
import { runGeneration } from "../generation/run";
import { startRecipeGeneration } from "../generation/start";
import { loadRecipeView } from "../generation/view";
import {
  proposeNutritionMatches,
  recipeIngredientIds,
  searchFoods,
  setNutritionLink,
  validateNutritionLinks,
} from "./match";

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

describe.skipIf(!hasTestDb)("valeurs nutritionnelles", () => {
  it("propose des correspondances Ciqual, les fait valider et calcule les apports", async () => {
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
    expect(view.nutrition).toMatchObject({ counted: 0, lineCount: 8, toValidate: 0 });
    expect(view.nutrition.lines.every((line) => line.status === "none")).toBe(true);

    // L'IA (factice : premier candidat) propose une correspondance par ingrédient.
    const ids = await recipeIngredientIds(db, user.id, recipeId);
    expect(ids).toHaveLength(8);
    const result = await proposeNutritionMatches(db, ai, user.id, ids);
    expect(result).toEqual({ ok: true, proposed: 8 });
    expect(ai.calls.at(-1)!.promptId).toBe("nutrition.match@1");
    expect(ai.calls.at(-1)!.user).toContain("· 9100 · Riz blanc, cru");
    // Une seconde demande ne refait rien : tout a déjà une correspondance.
    expect(await proposeNutritionMatches(db, ai, user.id, ids)).toEqual({ ok: false, reason: "empty" });

    view = (await loadRecipeView(db, recipeId, user.id))!;
    const rice = view.nutrition.lines.find((line) => line.label === "Riz à sushi")!;
    expect(rice).toMatchObject({ status: "proposed", food: { name: "Riz blanc, cru", source: "ciqual" } });
    expect(view.nutrition.toValidate).toBe(8);
    expect(view.nutrition.perPortion.kcal).toBeGreaterThan(0);

    // Calcul vérifiable : seul le riz est compté (300 g pour 4 personnes).
    for (const line of view.nutrition.lines) {
      if (line.ingredientId && line.label !== "Riz à sushi") {
        await setNutritionLink(db, user.id, line.ingredientId, null);
      }
    }
    const [riceFood] = await db
      .select()
      .from(s.nutritionFoods)
      .where(and(eq(s.nutritionFoods.source, "ciqual"), eq(s.nutritionFoods.code, "9100")));
    const kcal = riceFood!.per100g.kcal!;
    view = (await loadRecipeView(db, recipeId, user.id))!;
    expect(view.nutrition.counted).toBe(1);
    expect(view.nutrition.total.kcal).toBe(Math.round(3 * kcal));
    expect(view.nutrition.perPortion.kcal).toBe(Math.round((3 * kcal) / 4));
    expect(view.nutrition.per100g.kcal).toBe(Math.round(kcal));
    expect(view.nutrition.toValidate).toBe(1);

    // Correction manuelle par recherche, puis validation de tout.
    const [found] = await searchFoods(db, "riz blanc cuit");
    expect(found!.name).toContain("Riz blanc");
    expect(
      await setNutritionLink(db, other.id, rice.ingredientId!, "00000000-0000-4000-8000-000000000000"),
    ).toBe(false);
    expect(await validateNutritionLinks(db, user.id, ids)).toBe(1);
    view = (await loadRecipeView(db, recipeId, user.id))!;
    expect(view.nutrition.toValidate).toBe(0);

    // Chaque personne a ses propres correspondances.
    const [otherLinks] = await db
      .select({ n: s.ingredientNutritionLinks.ingredientId })
      .from(s.ingredientNutritionLinks)
      .where(eq(s.ingredientNutritionLinks.ownerId, other.id));
    expect(otherLinks).toBeUndefined();
  });
});
