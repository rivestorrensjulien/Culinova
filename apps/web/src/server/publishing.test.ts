/** Porte de l'agent de publication : clé, liens signés, file « à publier », comptes rendus. */
import { FakeLlmAdapter } from "@culinova/ai";
import * as s from "@culinova/db/schema";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { emptyWizardState, type WizardState } from "@/lib/wizard";
import { createTestUser, hasTestDb, testDb } from "@/test/db";
import { runGeneration } from "./generation/run";
import { startRecipeGeneration } from "./generation/start";
import {
  agentAuthorized,
  agentQueue,
  cancelPublication,
  publicationStatuses,
  queuePublication,
  reportPublication,
  signedImagePath,
  verifyImageSignature,
} from "./publishing";

const KEY = "k".repeat(40);
const env = { AGENT_API_KEY: KEY };

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

async function recipeOf(userId: string): Promise<string> {
  const db = testDb();
  const [draft] = await db.insert(s.recipeDrafts).values({ userId, state, wizardStep: 9 }).returning();
  const started = await startRecipeGeneration(db, { userId, draftId: draft!.id });
  if (!started.ok) throw new Error(started.reason);
  await runGeneration(db, new FakeLlmAdapter(), started.generationId);
  const [row] = await db.select().from(s.recipeDrafts).where(eq(s.recipeDrafts.id, draft!.id));
  return row!.recipeId!;
}

describe("clé de l'agent et liens signés", () => {
  it("n'accepte que la bonne clé, et seulement si elle est assez longue", () => {
    expect(agentAuthorized(`Bearer ${KEY}`, env)).toBe(true);
    expect(agentAuthorized(`Bearer ${KEY}x`, env)).toBe(false);
    expect(agentAuthorized(null, env)).toBe(false);
    expect(agentAuthorized("Bearer court", { AGENT_API_KEY: "court" })).toBe(false);
  });

  it("signe des liens de photo valables une heure", () => {
    const now = new Date("2026-10-12T10:00:00Z");
    const path = signedImagePath("abc", now, env)!;
    const url = new URL(path, "https://culinova.app");
    const expire = url.searchParams.get("expire");
    const signature = url.searchParams.get("signature");
    expect(verifyImageSignature("abc", expire, signature, now, env)).toBe(true);
    expect(verifyImageSignature("autre", expire, signature, now, env)).toBe(false);
    expect(verifyImageSignature("abc", expire, signature, new Date("2026-10-12T11:01:00Z"), env)).toBe(false);
    expect(verifyImageSignature("abc", expire, signature, now, { AGENT_API_KEY: "z".repeat(40) })).toBe(
      false,
    );
  });
});

describe.skipIf(!hasTestDb)("file de publication", () => {
  it("ne concerne que les recettes de l'administrateur et suit chaque réseau", async () => {
    const db = testDb();
    const admin = await createTestUser({ role: "admin" });
    const cook = await createTestUser();
    const recipeId = await recipeOf(admin.id);
    const cookRecipe = await recipeOf(cook.id);

    expect(await queuePublication(db, cook.id, cookRecipe, ["tiktok"])).toBe(false);
    expect(await queuePublication(db, cook.id, recipeId, ["tiktok"])).toBe(false);
    expect(await queuePublication(db, admin.id, recipeId, ["tiktok", "instagram"])).toBe(true);

    const queue = await agentQueue(db, "https://culinova.app", { recipeId });
    expect(queue).toHaveLength(1);
    expect(queue[0]).toMatchObject({ recipeId, pending: ["instagram", "tiktok"] });
    expect(queue[0]!.social.map((c) => c.platform).sort()).toEqual(["instagram", "tiktok"]);
    expect((await agentQueue(db, "https://culinova.app")).some((r) => r.recipeId === recipeId)).toBe(true);

    expect(
      await reportPublication(
        db,
        recipeId,
        "tiktok",
        { status: "published", postUrl: "https://www.tiktok.com/@culinova/video/1" },
        { actorId: null, via: "agent" },
      ),
    ).toBe(true);
    expect(
      await reportPublication(
        db,
        cookRecipe,
        "tiktok",
        { status: "failed" },
        { actorId: null, via: "agent" },
      ),
    ).toBe(false);
    let statuses = await publicationStatuses(db, recipeId);
    expect(statuses.find((p) => p.platform === "tiktok")).toMatchObject({
      status: "published",
      postUrl: "https://www.tiktok.com/@culinova/video/1",
    });
    expect((await agentQueue(db, "https://culinova.app", { recipeId }))[0]!.pending).toEqual(["instagram"]);

    // Retirer de la file garde ce qui est déjà publié.
    expect(await cancelPublication(db, admin.id, recipeId)).toBe(true);
    statuses = await publicationStatuses(db, recipeId);
    expect(statuses.map((p) => p.platform)).toEqual(["tiktok"]);
  });
});
