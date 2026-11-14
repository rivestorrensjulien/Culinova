/** Recette d'essai sans compte (P7) : garde-fous, recette lisible, rattachement au compte. */
import { FakeLlmAdapter } from "@culinova/ai";
import * as s from "@culinova/db/schema";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { createTestUser, hasTestDb, testDb } from "@/test/db";
import { submitInvitationRequest } from "./access/requests";
import { runGeneration } from "./generation/run";
import { listRecipes } from "./generation/view";
import {
  claimTrialForInvitation,
  getTrialSettings,
  loadTrial,
  saveTrialSettings,
  startTrial,
  trialsLastDay,
} from "./trials";

const input = {
  mode: "idea" as const,
  input: "Un plat de saumon",
  momentCode: "main",
  servings: 2,
  maxMinutes: 30,
  language: "fr" as const,
};
let ipCounter = 0;
const meta = () => ({ ip: `203.0.113.${++ipCounter}-${Date.now()}`, userAgent: "vitest" });

describe.skipIf(!hasTestDb)("recettes d'essai sans compte", () => {
  it("génère une recette lisible, sans prix, à une adresse secrète", async () => {
    const db = testDb();
    const started = await startTrial(db, input, meta());
    expect(started.ok).toBe(true);
    if (!started.ok) return;
    expect(started.token.length).toBeGreaterThanOrEqual(20);

    const pending = (await loadTrial(db, started.token))!;
    expect(pending.status).toBe("queued");
    expect(pending.recipe).toBeNull();

    expect(await runGeneration(db, new FakeLlmAdapter(), started.generationId)).toBe("succeeded");
    const trial = (await loadTrial(db, started.token))!;
    expect(trial.status).toBe("succeeded");
    expect(trial.recipe!.servings).toBe(2);
    expect(trial.recipe!.ingredients[0]!.amount).toMatch(/\d/);
    expect(trial.recipe!.steps.map((step) => step.text).join(" ")).not.toMatch(/\{\{/);
    expect(trial.recipe!.tips.length).toBeGreaterThanOrEqual(2);
    const json = JSON.stringify(trial);
    for (const key of ["cost", "Cents", "price", "margin", "kcal"]) expect(json).not.toContain(key);

    // La génération n'appartient à personne et ne touche aucun quota.
    const [generation] = await db
      .select()
      .from(s.aiGenerations)
      .where(eq(s.aiGenerations.id, started.generationId));
    expect(generation!.userId).toBeNull();
    expect(generation!.kind).toBe("trial");

    expect(await loadTrial(db, "inconnu")).toBeNull();
    expect(await loadTrial(db, "../../etc/passwd-aaaaaaaaaaaa")).toBeNull();
  });

  it("2 essais par jour et par connexion, demande vérifiée", async () => {
    const db = testDb();
    const same = meta();
    expect((await startTrial(db, input, same)).ok).toBe(true);
    expect((await startTrial(db, input, same)).ok).toBe(true);
    expect(await startTrial(db, input, same)).toEqual({ ok: false, reason: "rate_limited" });
    expect(await startTrial(db, { ...input, input: " " }, meta())).toEqual({ ok: false, reason: "invalid" });
    expect(await startTrial(db, { ...input, momentCode: "inconnu" }, meta())).toEqual({
      ok: false,
      reason: "invalid",
    });
  });

  it("fermés ou complets selon les réglages de l'administration", async () => {
    const db = testDb();
    const admin = await createTestUser({ role: "admin" });
    const ctx = { actorId: admin.id };
    const before = await getTrialSettings(db);
    try {
      await saveTrialSettings(db, { enabled: false, dailyLimit: 30 }, ctx);
      expect(await startTrial(db, input, meta())).toEqual({ ok: false, reason: "closed" });
      await saveTrialSettings(db, { enabled: true, dailyLimit: await trialsLastDay(db) }, ctx);
      expect(await startTrial(db, input, meta())).toEqual({ ok: false, reason: "full" });
    } finally {
      await saveTrialSettings(db, before, ctx);
    }
  });

  it("la recette d'essai jointe à la demande rejoint le compte ouvert avec l'invitation", async () => {
    const db = testDb();
    const started = await startTrial(db, input, meta());
    if (!started.ok) throw new Error(started.reason);
    await runGeneration(db, new FakeLlmAdapter(), started.generationId);

    const email = `essai-${Date.now()}@example.test`;
    expect(
      (
        await submitInvitationRequest(
          db,
          { name: "Alex", email, profile: null, message: null, locale: "fr", trialToken: started.token },
          meta(),
        )
      ).ok,
    ).toBe(true);
    const [request] = await db
      .select()
      .from(s.invitationRequests)
      .where(eq(s.invitationRequests.email, email));
    expect(request!.trialId).toBeTruthy();

    // Invitation acceptée (simplifiée), puis compte créé avec elle.
    const [invitation] = await db
      .insert(s.invitations)
      .values({ codeHash: `hash-${Date.now()}`, codeHint: "ESSA", email })
      .returning();
    await db
      .update(s.invitationRequests)
      .set({ status: "invited", invitationId: invitation!.id })
      .where(eq(s.invitationRequests.id, request!.id));
    const user = await createTestUser({ email });
    const recipeId = await claimTrialForInvitation(db, user.id, invitation!.id);
    expect(recipeId).toBeTruthy();
    const recipes = await listRecipes(db, user.id);
    expect(recipes.map((r) => r.id)).toContain(recipeId);
    expect((await loadTrial(db, started.token))!.claimed).toBe(true);

    // Une seule fois : ni deuxième copie, ni rattachement à un autre compte.
    expect(await claimTrialForInvitation(db, user.id, invitation!.id)).toBeNull();
    const other = await createTestUser();
    expect(await claimTrialForInvitation(db, other.id, invitation!.id)).toBeNull();
  });
});
