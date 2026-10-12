/** « Mon compte » : export complet et suppression définitive. */
import { FakeLlmAdapter } from "@culinova/ai";
import * as s from "@culinova/db/schema";
import { eq } from "drizzle-orm";
import { existsSync } from "node:fs";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { emptyWizardState, type WizardState } from "@/lib/wizard";
import { createTestUser, hasTestDb, testDb } from "@/test/db";
import { deleteAccount, exportAccountData } from "./account";
import { createInvitation } from "./access/invitations";
import { runGeneration } from "./generation/run";
import { startRecipeGeneration } from "./generation/start";
import { LocalStorage } from "./images/storage";
import { toggleFavorite } from "./library";

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

async function userWithRecipe() {
  const db = testDb();
  const user = await createTestUser();
  const [draft] = await db
    .insert(s.recipeDrafts)
    .values({ userId: user.id, state, wizardStep: 9 })
    .returning();
  const started = await startRecipeGeneration(db, { userId: user.id, draftId: draft!.id });
  if (!started.ok) throw new Error(started.reason);
  await runGeneration(db, new FakeLlmAdapter(), started.generationId);
  const [recipe] = await db.select().from(s.recipes).where(eq(s.recipes.ownerId, user.id));
  return { user, recipe: recipe!, generationId: started.generationId };
}

describe.skipIf(!hasTestDb)("mon compte", () => {
  it("exporte toutes les données de la personne, sans secret", async () => {
    const db = testDb();
    const { user, recipe } = await userWithRecipe();
    await toggleFavorite(db, user.id, recipe.id);
    await db.insert(s.sessions).values({
      token: `secret-${user.id}`,
      userId: user.id,
      expiresAt: new Date(Date.now() + 3600_000),
    });

    const data = await exportAccountData(db, user.id);
    expect(data.profile.email).toBe(user.email);
    expect(data.recipes).toHaveLength(1);
    expect(data.recipes[0]!.favorite).toBe(true);
    const version = data.recipes[0]!.versions[0]!;
    expect(version.ingredients.length).toBeGreaterThan(0);
    expect(version.steps.length).toBeGreaterThan(0);
    expect(data.usage).toContainEqual(expect.objectContaining({ metric: "recipes", count: 1 }));
    expect(data.sessions).toHaveLength(1);
    // Les jetons de session ne sortent jamais.
    expect(JSON.stringify(data)).not.toContain(`secret-${user.id}`);
  });

  it("supprime le compte, ses photos et révoque son code", async () => {
    const db = testDb();
    const { user, recipe, generationId } = await userWithRecipe();
    const { invitation } = await createInvitation(db, {}, { actorId: null });
    await db
      .update(s.invitations)
      .set({ redeemedBy: user.id, redeemedAt: new Date(), reservedEmail: user.email })
      .where(eq(s.invitations.id, invitation.id));

    const root = await mkdtemp(join(tmpdir(), "culinova-account-"));
    const storage = new LocalStorage(root);
    const key = `${user.id}/photo/source.jpg`;
    await storage.put(key, new Uint8Array([1, 2, 3]));
    await db.insert(s.recipeImages).values({
      recipeVersionId: recipe.currentVersionId!,
      format: "source",
      storageKey: key,
      status: "ready",
    });

    expect(await deleteAccount(db, user.id, { storage })).toEqual({ ok: true, images: 1 });

    expect(await db.select().from(s.users).where(eq(s.users.id, user.id))).toHaveLength(0);
    expect(await db.select().from(s.recipes).where(eq(s.recipes.id, recipe.id))).toHaveLength(0);
    expect(existsSync(join(root, key))).toBe(false);
    // Le coût de la génération reste compté, sans lien ni contenu.
    const [generation] = await db.select().from(s.aiGenerations).where(eq(s.aiGenerations.id, generationId));
    expect(generation).toMatchObject({ userId: null, output: null, recipeId: null });
    // Le code ne redevient pas disponible et ne garde pas l'adresse.
    const [code] = await db.select().from(s.invitations).where(eq(s.invitations.id, invitation.id));
    expect(code!.revokedAt).not.toBeNull();
    expect(code!.reservedEmail).toBeNull();
    const [entry] = await db.select().from(s.auditLogs).where(eq(s.auditLogs.entityId, user.id));
    expect(entry).toBeDefined();

    expect(await deleteAccount(db, user.id, { storage })).toEqual({ ok: false, reason: "not_found" });
  });
});
