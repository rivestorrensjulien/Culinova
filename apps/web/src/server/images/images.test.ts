/** Photo d'une recette : prompt, image HD, 4 recadrages, stockage et crédit d'image. */
import { AiGenerationError, FakeLlmAdapter, type ImageAdapter } from "@culinova/ai";
import * as s from "@culinova/db/schema";
import { eq } from "drizzle-orm";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { emptyWizardState, type WizardState } from "@/lib/wizard";
import { createTestUser, hasTestDb, testDb } from "@/test/db";
import { runGeneration } from "../generation/run";
import { startRecipeGeneration } from "../generation/start";
import { loadRecipeView } from "../generation/view";
import { getMonthlyUsage } from "../quotas";
import { runImageGeneration, startImageGeneration } from "./generate";
import { LocalStorage } from "./storage";

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

async function recipeFor(userId: string) {
  const db = testDb();
  const [draft] = await db.insert(s.recipeDrafts).values({ userId, state, wizardStep: 9 }).returning();
  const started = await startRecipeGeneration(db, { userId, draftId: draft!.id });
  if (!started.ok) throw new Error(started.reason);
  await runGeneration(db, new FakeLlmAdapter(), started.generationId);
  const [row] = await db.select().from(s.recipeDrafts).where(eq(s.recipeDrafts.id, draft!.id));
  return row!.recipeId!;
}

describe.skipIf(!hasTestDb)("photo de recette", () => {
  it("crée l'image HD et ses 4 recadrages, et décompte un crédit", async () => {
    const db = testDb();
    const ai = new FakeLlmAdapter();
    const user = await createTestUser();
    const other = await createTestUser();
    const recipeId = await recipeFor(user.id);

    expect(await startImageGeneration(db, { userId: other.id, recipeId })).toEqual({
      ok: false,
      reason: "not_found",
    });
    const started = await startImageGeneration(db, { userId: user.id, recipeId });
    if (!started.ok) throw new Error(started.reason);
    expect(await startImageGeneration(db, { userId: user.id, recipeId })).toEqual({
      ok: false,
      reason: "busy",
    });
    expect((await getMonthlyUsage(db, user.id)).used.images).toBe(1);

    let view = (await loadRecipeView(db, recipeId, user.id))!;
    expect(view.images.pendingGenerationId).toBe(started.generationId);

    const root = await mkdtemp(join(tmpdir(), "culinova-images-test-"));
    const storage = new LocalStorage(root);
    const [generation] = await db
      .update(s.aiGenerations)
      .set({ status: "running" })
      .where(eq(s.aiGenerations.id, started.generationId))
      .returning();
    expect(await runImageGeneration(db, ai, generation!, { storage })).toBe("succeeded");
    // Le prompt photo est rédigé d'après le dressage.
    expect(ai.calls.at(-1)!.promptId).toBe("image.prompt@6");
    expect(ai.calls.at(-1)!.user).toContain("Assiette creuse noire mate");

    view = (await loadRecipeView(db, recipeId, user.id))!;
    expect(view.images.pendingGenerationId).toBeNull();
    expect(view.images.quota).toEqual({ used: 1, limit: 10 });
    expect(view.images.current!.formats.map((f) => [f.format, f.width, f.height])).toEqual([
      ["4:5", 1152, 1440],
      ["1:1", 1440, 1440],
      ["9:16", 810, 1440],
      ["16:9", 1440, 810],
    ]);

    const [story] = await db
      .select({ key: s.recipeImages.storageKey })
      .from(s.recipeImages)
      .where(eq(s.recipeImages.id, view.images.current!.formats[2]!.id));
    const bytes = await storage.get(story!.key!);
    const meta = await sharp(Buffer.from(bytes!)).metadata();
    expect([meta.format, meta.width, meta.height]).toEqual(["jpeg", 810, 1440]);
  });

  it("rend le crédit si la génération échoue", async () => {
    const db = testDb();
    const user = await createTestUser();
    const recipeId = await recipeFor(user.id);
    const started = await startImageGeneration(db, { userId: user.id, recipeId });
    if (!started.ok) throw new Error(started.reason);
    expect((await getMonthlyUsage(db, user.id)).used.images).toBe(1);

    const failing: ImageAdapter = {
      provider: "test",
      model: "test",
      generate: async () => {
        throw new AiGenerationError("provider_error", "Service indisponible");
      },
    };
    const [generation] = await db
      .select()
      .from(s.aiGenerations)
      .where(eq(s.aiGenerations.id, started.generationId));
    expect(await runImageGeneration(db, new FakeLlmAdapter(), generation!, { images: failing })).toBe(
      "failed",
    );
    const [after] = await db
      .select()
      .from(s.aiGenerations)
      .where(eq(s.aiGenerations.id, started.generationId));
    expect(after!.status).toBe("failed");
    expect(after!.error).toMatch(/^provider_error : /);
    expect((await getMonthlyUsage(db, user.id)).used.images).toBe(0);
  });
});
