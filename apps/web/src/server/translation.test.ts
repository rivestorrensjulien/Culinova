/** Versions linguistiques : traduction proposée, validée, signalée quand la recette change. */
import { FakeLlmAdapter } from "@culinova/ai";
import * as s from "@culinova/db/schema";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { emptyWizardState, type WizardState } from "@/lib/wizard";
import { createTestUser, hasTestDb, testDb } from "@/test/db";
import { runGeneration } from "./generation/run";
import { startRecipeGeneration, startRegeneration } from "./generation/start";
import { loadRecipeView } from "./generation/view";
import { translateRecipe, validateTranslation } from "./translation";

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

describe.skipIf(!hasTestDb)("traductions", () => {
  it("traduit la version active, la fait valider et signale une nouvelle version", async () => {
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
    expect(view.translation).toEqual({ target: "en", current: null, outdatedVersionNo: null });

    expect(await translateRecipe(db, ai, other.id, recipeId)).toEqual({ ok: false, reason: "not_found" });
    expect(await translateRecipe(db, ai, user.id, recipeId)).toEqual({ ok: true });
    expect(ai.calls.at(-1)!.promptId).toBe("recipe.translate@1");

    view = (await loadRecipeView(db, recipeId, user.id))!;
    const payload = view.translation.current!.payload;
    expect(view.translation.current!.validated).toBe(false);
    expect(payload.name).toContain("[EN]");
    const rice = view.ingredients.find((i) => i.label === "Riz à sushi")!;
    expect(payload.ingredients[rice.id]!.label).toBe("Riz à sushi [EN]");
    // Les jetons de quantité pointent toujours vers les lignes : les quantités restent calculées.
    expect(payload.steps[view.steps[1]!.id]!.action).toContain(`{{${rice.id}}}`);

    expect(await validateTranslation(db, other.id, recipeId)).toBe(false);
    expect(await validateTranslation(db, user.id, recipeId)).toBe(true);
    view = (await loadRecipeView(db, recipeId, user.id))!;
    expect(view.translation.current!.validated).toBe(true);

    // Nouvelle version : la traduction de la version 1 est à mettre à jour.
    const edit = await startRegeneration(db, {
      userId: user.id,
      recipeId,
      instruction: "Plus léger",
      mode: "edit",
    });
    if (!edit.ok) throw new Error(edit.reason);
    await runGeneration(db, ai, edit.generationId);
    view = (await loadRecipeView(db, recipeId, user.id))!;
    expect(view.translation).toEqual({ target: "en", current: null, outdatedVersionNo: 1 });
    // La version originale (1) garde sa traduction.
    expect((await loadRecipeView(db, recipeId, user.id, 1))!.translation.current!.validated).toBe(true);
  });
});
