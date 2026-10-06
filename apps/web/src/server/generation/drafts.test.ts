import { FakeLlmAdapter } from "@culinova/ai";
import { describe, expect, it } from "vitest";
import { emptyWizardState } from "@/lib/wizard";
import { createTestUser, hasTestDb, testDb } from "@/test/db";
import { getOrCreateDraft, saveDraft, startNewDraft } from "./drafts";
import { runGeneration } from "./run";
import { startRecipeGeneration } from "./start";
import { listRecipes, loadRecipeView } from "./view";

describe.skipIf(!hasTestDb)("brouillons du wizard", () => {
  it("reprend le même brouillon ouvert", async () => {
    const user = await createTestUser();
    const first = await getOrCreateDraft(testDb(), user.id, "en");
    expect(first.state).toMatchObject({ step: 1, language: "en", servings: 4 });
    expect((await getOrCreateDraft(testDb(), user.id, "fr")).id).toBe(first.id);
  });

  it("enregistre la dernière version et refuse une sauvegarde plus ancienne", async () => {
    const db = testDb();
    const user = await createTestUser();
    const draft = await getOrCreateDraft(db, user.id, "fr");
    const t1 = new Date("2026-10-06T10:00:00Z");
    const t2 = new Date("2026-10-06T10:00:05Z");
    const recent = { ...emptyWizardState(), step: 3, momentCode: "main" };
    expect(
      await saveDraft(db, { userId: user.id, draftId: draft.id, state: recent, clientUpdatedAt: t2 }),
    ).toMatchObject({ ok: true });
    const stale = await saveDraft(db, {
      userId: user.id,
      draftId: draft.id,
      state: { ...recent, momentCode: "dessert" },
      clientUpdatedAt: t1,
    });
    expect(stale).toMatchObject({ ok: false, reason: "stale", state: { step: 3, momentCode: "main" } });
    // Les données invalides sont corrigées plutôt qu'enregistrées telles quelles.
    await saveDraft(db, {
      userId: user.id,
      draftId: draft.id,
      state: { step: 99, servings: -3, input: 42 },
      clientUpdatedAt: new Date("2026-10-06T10:01:00Z"),
    });
    expect((await getOrCreateDraft(db, user.id, "fr")).state).toMatchObject({
      step: 1,
      servings: 4,
      input: "",
    });
    // Le brouillon d'une autre personne est introuvable.
    const other = await createTestUser();
    expect(
      await saveDraft(db, {
        userId: other.id,
        draftId: draft.id,
        state: recent,
        clientUpdatedAt: new Date(),
      }),
    ).toEqual({ ok: false, reason: "not_found" });
  });

  it("ouvre un nouveau brouillon et affiche la recette générée", async () => {
    const db = testDb();
    const user = await createTestUser();
    const draft = await getOrCreateDraft(db, user.id, "fr");
    await saveDraft(db, {
      userId: user.id,
      draftId: draft.id,
      state: {
        ...emptyWizardState(),
        step: 9,
        momentCode: "dessert",
        influenceCode: "none",
        styleCode: "traditional",
        mode: "name",
        input: "Tarte Tatin",
        servings: 8,
      },
      clientUpdatedAt: new Date(),
    });
    const started = await startRecipeGeneration(db, { userId: user.id, draftId: draft.id });
    if (!started.ok) throw new Error(started.reason);
    await runGeneration(db, new FakeLlmAdapter(), started.generationId);
    const done = await getOrCreateDraft(db, user.id, "fr");
    expect(done).toMatchObject({ id: draft.id, status: "done" });

    const view = await loadRecipeView(db, done.recipeId!, user.id);
    expect(view).toMatchObject({
      versionNo: 1,
      versionCount: 1,
      servings: 8,
      regenerations: { used: 0, limit: 2 },
      pendingGenerationId: null,
    });
    expect(view!.ingredients[0]).toMatchObject({
      label: "Riz à sushi",
      dimension: "mass",
      quantity: 600,
      toConfirm: false,
    });
    expect(view!.ingredients.find((i) => i.label === "Yuzu kosho")).toMatchObject({
      toConfirm: true,
      optional: true,
    });
    expect(view!.steps[0]!.ingredientIds).toEqual([view!.ingredients[0]!.id]);
    expect(view!.social.map((x) => x.platform)).toEqual([
      "generic",
      "instagram",
      "tiktok",
      "pinterest",
      "linkedin",
    ]);
    expect(await loadRecipeView(db, done.recipeId!, (await createTestUser()).id)).toBeNull();
    expect((await listRecipes(db, user.id)).map((r) => r.servings)).toEqual([8]);

    const fresh = await startNewDraft(db, user.id, "fr");
    expect(fresh.id).not.toBe(draft.id);
    expect(fresh.state).toMatchObject({ step: 1 });
  });
});
