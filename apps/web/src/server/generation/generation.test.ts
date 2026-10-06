/**
 * Pipeline de génération de bout en bout (base réelle, IA factice) :
 * paramètres transmis, quotas, budget, échecs, rapprochement des ingrédients,
 * contenu social et régénérations.
 */
import { FakeLlmAdapter, fakeRecipe } from "@culinova/ai";
import { monthlyPeriod } from "@culinova/core";
import * as s from "@culinova/db/schema";
import { and, asc, eq } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";
import { emptyWizardState, type WizardState } from "@/lib/wizard";
import { createTestUser, hasTestDb, testDb } from "@/test/db";
import { getMonthlyUsage } from "../quotas";
import { runGeneration } from "./run";
import { startRecipeGeneration, startRegeneration } from "./start";

const japaneseCreative: WizardState = {
  ...emptyWizardState("fr"),
  step: 9,
  momentCode: "main",
  influenceCode: "asia",
  regionCode: "east_asia",
  countryIso: "JP",
  cuisineCodes: ["japanese"],
  styleCode: "creative",
  mode: "idea",
  input: "Un plat de saumon réconfortant pour l'automne",
  servings: 4,
};

async function newDraft(userId: string, state: WizardState = japaneseCreative) {
  const [draft] = await testDb()
    .insert(s.recipeDrafts)
    .values({ userId, state, wizardStep: state.step })
    .returning();
  return draft!;
}

async function draftRow(id: string) {
  return (await testDb().select().from(s.recipeDrafts).where(eq(s.recipeDrafts.id, id)))[0]!;
}

async function setUsage(userId: string, metric: string, count: number) {
  await testDb()
    .insert(s.usageCounters)
    .values({ subjectType: "user", subjectId: userId, metric, period: monthlyPeriod(new Date()), count })
    .onConflictDoUpdate({
      target: [
        s.usageCounters.subjectType,
        s.usageCounters.subjectId,
        s.usageCounters.metric,
        s.usageCounters.period,
      ],
      set: { count },
    });
}

describe.skipIf(!hasTestDb)("génération d'une recette", () => {
  afterEach(async () => {
    await testDb()
      .update(s.siteSettings)
      .set({ value: { capUsdMicros: null } })
      .where(eq(s.siteSettings.key, s.SETTING_KEYS.monthlyAiBudget));
  });

  it("génère « Plat · Asie · Japon · Interprétation créative » et l'enregistre", async () => {
    const db = testDb();
    const user = await createTestUser();
    const draft = await newDraft(user.id);
    const ai = new FakeLlmAdapter();

    const started = await startRecipeGeneration(db, { userId: user.id, draftId: draft.id });
    expect(started.ok).toBe(true);
    if (!started.ok) return;
    expect((await draftRow(draft.id)).status).toBe("generating");
    expect((await getMonthlyUsage(db, user.id)).used.recipes).toBe(1);

    expect(await runGeneration(db, ai, started.generationId)).toBe("succeeded");
    // Une seconde exécution (relance de la tâche) ne refait rien.
    expect(await runGeneration(db, ai, started.generationId)).toBe("skipped");

    // Tous les paramètres ont été transmis au moteur.
    const prompt = ai.calls[0]!.user;
    for (const expected of [
      "Moment de consommation : Plat",
      "Influence culinaire : Asie",
      "Pays : Japon",
      "- Japonaise (Japon, Asie de l'Est)",
      "Ingrédients caractéristiques : dashi",
      "Style : Interprétation créative",
      "Langue de la recette : français",
      "Mode de création : à partir d'une idée",
      "Nombre de personnes : 4",
    ]) {
      expect(prompt).toContain(expected);
    }
    expect(ai.calls[1]!.promptId).toBe("social.generate@1");

    const finished = await draftRow(draft.id);
    expect(finished).toMatchObject({ status: "done", error: null });
    const [recipe] = await db.select().from(s.recipes).where(eq(s.recipes.id, finished.recipeId!));
    expect(recipe).toMatchObject({
      ownerId: user.id,
      source: "generated",
      status: "ready",
      originalLanguage: "fr",
    });
    const [version] = await db
      .select()
      .from(s.recipeVersions)
      .where(eq(s.recipeVersions.id, recipe!.currentVersionId!));
    expect(version).toMatchObject({
      versionNo: 1,
      servings: 4,
      cuisineLabel: "Japonaise",
      difficulty: "medium",
    });
    expect(version!.fusionLabel).toContain("interprétation créative");

    // Ingrédients rapprochés de la base ; les inconnus sont créés « à confirmer ».
    const lines = await db
      .select({
        label: s.recipeIngredients.label,
        g: s.recipeIngredients.quantityG,
        ml: s.recipeIngredients.quantityMl,
        code: s.ingredients.code,
        status: s.ingredients.status,
        scope: s.ingredients.scope,
      })
      .from(s.recipeIngredients)
      .innerJoin(s.ingredients, eq(s.ingredients.id, s.recipeIngredients.ingredientId))
      .where(eq(s.recipeIngredients.recipeVersionId, version!.id))
      .orderBy(asc(s.recipeIngredients.sortOrder));
    const byLabel = Object.fromEntries(lines.map((l) => [l.label, l]));
    expect(byLabel["Riz à sushi"]).toMatchObject({ code: "rice_sushi", g: "300.000" });
    expect(byLabel["Pavé de saumon"]).toMatchObject({ code: "salmon" });
    expect(byLabel["Sauce soja"]).toMatchObject({ code: "soy_sauce", ml: "30.000" });
    expect(byLabel["Graines de sésame"]).toMatchObject({ code: "sesame_seed" });
    expect(byLabel["Gingembre frais"]).toMatchObject({ code: "ginger" });
    expect(byLabel["Vinaigre de riz"]).toMatchObject({ code: null, status: "to_confirm", scope: "owner" });
    expect(byLabel["Yuzu kosho"]).toMatchObject({ status: "to_confirm" });

    const steps = await db
      .select()
      .from(s.recipeSteps)
      .where(eq(s.recipeSteps.recipeVersionId, version!.id))
      .orderBy(asc(s.recipeSteps.sortOrder));
    expect(steps.map((st) => st.phase)).toEqual([
      "mise_en_place",
      "cooking",
      "cooking",
      "cooking",
      "cooking",
      "plating",
    ]);
    expect(steps[1]!.ingredientRefs).toHaveLength(2);
    expect(steps[1]).toMatchObject({ durationS: 720, timer: true });

    const social = await db
      .select()
      .from(s.socialContents)
      .where(eq(s.socialContents.recipeVersionId, version!.id));
    expect(social.map((r) => r.platform).sort()).toEqual([
      "generic",
      "instagram",
      "linkedin",
      "pinterest",
      "tiktok",
    ]);

    // Coût IA mesuré par génération.
    const generations = await db.select().from(s.aiGenerations).where(eq(s.aiGenerations.userId, user.id));
    expect(generations.map((g) => [g.kind, g.status]).sort()).toEqual([
      ["recipe", "succeeded"],
      ["social", "succeeded"],
    ]);
    const main = generations.find((g) => g.kind === "recipe")!;
    expect(main).toMatchObject({
      promptVersion: "recipe.generate@1",
      tokensIn: 1200,
      tokensOut: 2400,
      costUsdMicros: 26_400,
      recipeId: recipe!.id,
    });
  });

  it("recalcule les quantités au nombre de personnes demandé", async () => {
    const db = testDb();
    const user = await createTestUser();
    const draft = await newDraft(user.id, { ...japaneseCreative, servings: 6 });
    const started = await startRecipeGeneration(db, { userId: user.id, draftId: draft.id });
    if (!started.ok) throw new Error("refusé");
    await runGeneration(db, new FakeLlmAdapter(), started.generationId);
    const [version] = await db
      .select()
      .from(s.recipeVersions)
      .innerJoin(s.recipes, eq(s.recipes.currentVersionId, s.recipeVersions.id))
      .where(eq(s.recipes.ownerId, user.id));
    expect(version!.recipe_versions.servings).toBe(6);
  });

  it("refuse la 6e recette du mois avec la date de remise à zéro", async () => {
    const db = testDb();
    const user = await createTestUser();
    await setUsage(user.id, "recipes", 5);
    const draft = await newDraft(user.id);
    const result = await startRecipeGeneration(db, {
      userId: user.id,
      draftId: draft.id,
      now: new Date("2026-10-15T10:00:00Z"),
    });
    expect(result).toEqual({
      ok: false,
      reason: "quota",
      metric: "recipes",
      limit: 5,
      resetsOn: { year: 2026, month: 11, day: 1 },
    });
    expect((await draftRow(draft.id)).status).toBe("editing");
  });

  it("refuse un brouillon incomplet, un double lancement et un brouillon d'autrui", async () => {
    const db = testDb();
    const user = await createTestUser();
    const other = await createTestUser();
    const incomplete = await newDraft(user.id, { ...japaneseCreative, styleCode: null });
    expect(await startRecipeGeneration(db, { userId: user.id, draftId: incomplete.id })).toEqual({
      ok: false,
      reason: "incomplete",
    });

    const draft = await newDraft(user.id);
    expect((await startRecipeGeneration(db, { userId: user.id, draftId: draft.id })).ok).toBe(true);
    expect(await startRecipeGeneration(db, { userId: user.id, draftId: draft.id })).toEqual({
      ok: false,
      reason: "busy",
    });
    expect(await startRecipeGeneration(db, { userId: other.id, draftId: draft.id })).toEqual({
      ok: false,
      reason: "not_found",
    });
    expect((await getMonthlyUsage(db, user.id)).used.recipes).toBe(1);
  });

  it("suspend les générations quand le plafond de budget est atteint", async () => {
    const db = testDb();
    const user = await createTestUser();
    await db
      .update(s.siteSettings)
      .set({ value: { capUsdMicros: 0 } })
      .where(eq(s.siteSettings.key, s.SETTING_KEYS.monthlyAiBudget));
    const draft = await newDraft(user.id);
    expect(await startRecipeGeneration(db, { userId: user.id, draftId: draft.id })).toEqual({
      ok: false,
      reason: "budget",
    });
    expect((await getMonthlyUsage(db, user.id)).used.recipes).toBe(0);
  });

  it("rend le quota et affiche l'erreur quand la génération échoue", async () => {
    const db = testDb();
    const user = await createTestUser();
    const draft = await newDraft(user.id);
    const started = await startRecipeGeneration(db, { userId: user.id, draftId: draft.id });
    if (!started.ok) throw new Error("refusé");
    const broken = new FakeLlmAdapter(() => ({ ...fakeRecipe("Nombre de personnes : 4"), servings: 3 }));
    expect(await runGeneration(db, broken, started.generationId)).toBe("failed");
    expect(await draftRow(draft.id)).toMatchObject({ status: "failed", error: "invalid_output" });
    expect((await getMonthlyUsage(db, user.id)).used.recipes).toBe(0);
    const [generation] = await db
      .select()
      .from(s.aiGenerations)
      .where(eq(s.aiGenerations.id, started.generationId));
    expect(generation).toMatchObject({ status: "failed", costUsdMicros: 26_400 });
    // Après un échec, on peut relancer.
    expect((await startRecipeGeneration(db, { userId: user.id, draftId: draft.id })).ok).toBe(true);
  });

  it("autorise 2 régénérations par recette, chacune crée une nouvelle version", async () => {
    const db = testDb();
    const user = await createTestUser();
    const draft = await newDraft(user.id);
    const started = await startRecipeGeneration(db, { userId: user.id, draftId: draft.id });
    if (!started.ok) throw new Error("refusé");
    const ai = new FakeLlmAdapter();
    await runGeneration(db, ai, started.generationId);
    const recipeId = (await draftRow(draft.id)).recipeId!;

    for (const [i, instruction] of [
      [2, "Version plus légère"],
      [3, null],
    ] as const) {
      const regen = await startRegeneration(db, { userId: user.id, recipeId, instruction });
      expect(regen.ok).toBe(true);
      if (!regen.ok) return;
      expect(await startRegeneration(db, { userId: user.id, recipeId })).toEqual({
        ok: false,
        reason: "busy",
      });
      expect(await runGeneration(db, ai, regen.generationId)).toBe("succeeded");
      const [current] = await db
        .select({ versionNo: s.recipeVersions.versionNo, note: s.recipeVersions.changeNote })
        .from(s.recipes)
        .innerJoin(s.recipeVersions, eq(s.recipeVersions.id, s.recipes.currentVersionId))
        .where(eq(s.recipes.id, recipeId));
      expect(current!.versionNo).toBe(i);
    }
    const regenPrompts = ai.calls.filter((c) => c.promptId === "recipe.regenerate@1");
    expect(regenPrompts[0]!.user).toContain("Version plus légère");
    expect(regenPrompts[1]!.user).toContain("nettement différente");

    const third = await startRegeneration(db, { userId: user.id, recipeId });
    expect(third).toEqual({ ok: false, reason: "quota", metric: "regenerations", limit: 2, resetsOn: null });
    // Les régénérations ne consomment pas le quota mensuel de recettes.
    expect((await getMonthlyUsage(db, user.id)).used.recipes).toBe(1);
    const versions = await db
      .select()
      .from(s.recipeVersions)
      .where(and(eq(s.recipeVersions.recipeId, recipeId)));
    expect(versions).toHaveLength(3);
  });
});
