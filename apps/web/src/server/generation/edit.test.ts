/** Modification par instruction : la recette actuelle est reprise et modifiée, en nouvelle version. */
import { FakeLlmAdapter, recipeProblems } from "@culinova/ai";
import * as s from "@culinova/db/schema";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { emptyWizardState, type WizardState } from "@/lib/wizard";
import { createTestUser, hasTestDb, testDb } from "@/test/db";
import { loadGeneratedRecipe } from "./current-recipe";
import { runGeneration } from "./run";
import { startRecipeGeneration, startRegeneration } from "./start";
import { loadRecipeView } from "./view";

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

describe.skipIf(!hasTestDb)("modification par instruction", () => {
  it("reprend la recette actuelle, applique la consigne et compte une régénération", async () => {
    const db = testDb();
    const ai = new FakeLlmAdapter();
    const user = await createTestUser();
    const [draft] = await db
      .insert(s.recipeDrafts)
      .values({ userId: user.id, state, wizardStep: 9 })
      .returning();
    const started = await startRecipeGeneration(db, { userId: user.id, draftId: draft!.id });
    if (!started.ok) throw new Error(started.reason);
    await runGeneration(db, ai, started.generationId);
    const [row] = await db.select().from(s.recipeDrafts).where(eq(s.recipeDrafts.id, draft!.id));
    const recipeId = row!.recipeId!;
    const before = (await loadRecipeView(db, recipeId, user.id))!;

    // La recette enregistrée se remet au format de l'IA sans rien perdre (jetons, références).
    const current = (await loadGeneratedRecipe(db, before.versionId))!;
    expect(recipeProblems(current, 4)).toEqual([]);
    expect(current.steps[1]!.action).toBe("Cuire le riz {{i1}} avec l'eau {{i2}}, à couvert, à feu doux.");
    expect(current.ingredients.find((i) => i.name === "Yuzu kosho")!.storeBought).toBe(true);

    expect(
      await startRegeneration(db, { userId: user.id, recipeId, instruction: "  ", mode: "edit" }),
    ).toEqual({
      ok: false,
      reason: "incomplete",
    });
    const edit = await startRegeneration(db, {
      userId: user.id,
      recipeId,
      instruction: "Remplace le saumon par du tofu",
      mode: "edit",
    });
    if (!edit.ok) throw new Error(edit.reason);
    expect((await loadRecipeView(db, recipeId, user.id))!.pendingGenerationId).toBe(edit.generationId);
    expect(await runGeneration(db, ai, edit.generationId)).toBe("succeeded");

    const call = ai.calls.find((c) => c.promptId === "recipe.edit@1")!;
    expect(call.user).toContain("Remplace le saumon par du tofu");
    expect(call.user).toContain("{{i1}}");
    const after = (await loadRecipeView(db, recipeId, user.id))!;
    expect(after).toMatchObject({ versionNo: 2, regenerations: { used: 1, limit: 2 } });
    expect(after.name).toContain("(version modifiée)");
    expect(after.versions[0]!.changeNote).toBe("Remplace le saumon par du tofu");
  });
});
