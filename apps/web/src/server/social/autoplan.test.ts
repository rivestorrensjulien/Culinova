/** Planification automatique : recettes choisies par l'agent, proposées à la validation. */
import { FakeLlmAdapter } from "@culinova/ai";
import * as s from "@culinova/db/schema";
import { and, eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { emptyWizardState, type WizardState } from "@/lib/wizard";
import { createTestUser, hasTestDb, testDb } from "@/test/db";
import { runGeneration } from "../generation/run";
import { startRecipeGeneration } from "../generation/start";
import { getAutoplan, type PlannedDay, planUpcoming, rejectRecipe, saveAutoplan } from "./autoplan";
import { approveProposal, dismissProposal, recipeSchedule } from "./schedule";
import { toParisInput } from "./slots";

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

/** Photo principale de la version active et ses recadrages 9:16 et 4:5. */
async function addPhoto(recipeId: string) {
  const db = testDb();
  const [recipe] = await db.select().from(s.recipes).where(eq(s.recipes.id, recipeId));
  const versionId = recipe!.currentVersionId!;
  const [source] = await db
    .insert(s.recipeImages)
    .values({
      recipeVersionId: versionId,
      format: "source",
      status: "ready",
      isPrimary: true,
      storageKey: "x",
    })
    .returning();
  for (const format of ["9:16", "4:5"] as const) {
    await db.insert(s.recipeImages).values({
      recipeVersionId: versionId,
      format,
      sourceImageId: source!.id,
      status: "ready",
      storageKey: `x/${format}`,
    });
  }
}

/** Samedi 2 février 2030, 14 h à Paris. */
const NOW = new Date("2030-02-02T13:00:00Z");

describe.skipIf(!hasTestDb)("planification automatique", () => {
  let admin: { id: string };
  let withPhotos: string[];
  let withoutPhoto: string;

  beforeAll(async () => {
    admin = await createTestUser({ role: "admin" });
    withPhotos = [await recipeOf(admin.id), await recipeOf(admin.id), await recipeOf(admin.id)];
    for (const id of withPhotos) await addPhoto(id);
    withoutPhoto = await recipeOf(admin.id);
  });

  it("propose une recette par jour de publication, jamais deux fois la même, sans rien publier", async () => {
    const db = testDb();
    await saveAutoplan(db, admin.id, { enabled: false });
    expect(await planUpcoming(db, { now: NOW, onlyOwner: admin.id })).toEqual([]);
    await saveAutoplan(db, admin.id, { enabled: true });
    expect((await getAutoplan(db)).enabled).toBe(true);

    const notified: PlannedDay[][] = [];
    const photos: string[] = [];
    const deps = {
      now: NOW,
      onlyOwner: admin.id,
      random: () => 0.3,
      startPhoto: async (_db: unknown, _owner: string, recipeId: string) => {
        photos.push(recipeId);
        return true;
      },
      notify: async (_db: unknown, planned: PlannedDay[]) => {
        notified.push(planned);
      },
    };
    const planned = await planUpcoming(db, deps);
    // Dimanche, mardi, jeudi (le dimanche suivant dépasse les 7 jours).
    expect(planned.map((p) => toParisInput(new Date(p.day)))).toEqual([
      "2030-02-03T10:00",
      "2030-02-05T11:30",
      "2030-02-07T17:30",
    ]);
    // Trois recettes différentes, d'abord celles qui ont déjà leur photo : aucune photo générée.
    expect(new Set(planned.map((p) => p.recipeId)).size).toBe(3);
    expect(planned.every((p) => withPhotos.includes(p.recipeId))).toBe(true);
    expect(photos).toEqual([]);
    expect(notified).toHaveLength(1);

    // Pour chaque recette : Reel, TikTok et épingle le même jour, aux créneaux conseillés, à valider.
    const sunday = await recipeSchedule(db, planned[0]!.recipeId, NOW);
    expect(
      sunday.map((p) => [p.platform, p.format, toParisInput(new Date(p.scheduledAt)), p.status]),
    ).toEqual([
      ["instagram", "video", "2030-02-03T10:00", "proposed"],
      ["tiktok", "video", "2030-02-03T18:00", "proposed"],
      ["pinterest", "photo", "2030-02-03T21:00", "proposed"],
    ]);
    // La vidéo et le carrousel sont demandés à l'agent.
    const queued = await db
      .select()
      .from(s.recipePublications)
      .where(
        and(
          eq(s.recipePublications.recipeId, planned[0]!.recipeId),
          eq(s.recipePublications.status, "queued"),
        ),
      );
    expect(queued.length).toBeGreaterThan(0);

    // Tout est prévu : rien de plus, pas de nouvel e-mail.
    expect(await planUpcoming(db, deps)).toEqual([]);
    expect(notified).toHaveLength(1);
  });

  it("valider, écarter une publication, écarter une recette (remplacée par une autre)", async () => {
    const db = testDb();
    const [first, second] = (
      await Promise.all(withPhotos.map(async (id) => ({ id, rows: await recipeSchedule(db, id, NOW) })))
    ).filter((r) => r.rows.length > 0);
    const pin = first!.rows.find((p) => p.platform === "pinterest")!;
    const reel = second!.rows.find((p) => p.platform === "instagram")!;
    const tiktok = second!.rows.find((p) => p.platform === "tiktok")!;
    const reelRecipe = second!.id;
    // L'épingle (photo prête) se valide ; le Reel attend sa vidéo.
    expect(await approveProposal(db, admin.id, pin.id, { at: new Date(pin.scheduledAt) }, NOW)).toMatchObject(
      {
        ok: true,
      },
    );
    expect(await approveProposal(db, admin.id, reel.id, { at: new Date(reel.scheduledAt) }, NOW)).toEqual({
      ok: false,
      reason: "not_ready",
    });
    // Un autre compte ne valide rien.
    const cook = await createTestUser();
    expect(await dismissProposal(db, cook.id, tiktok.id)).toBe(false);
    expect(await dismissProposal(db, admin.id, tiktok.id)).toBe(true);

    // Écarter une recette libère son jour : une autre (ici sans photo, la photo est lancée) la remplace.
    expect(await rejectRecipe(db, cook.id, reelRecipe)).toBe(false);
    expect(await rejectRecipe(db, admin.id, reelRecipe)).toBe(true);
    const photos: string[] = [];
    const replanned = await planUpcoming(db, {
      now: NOW,
      onlyOwner: admin.id,
      startPhoto: async (_db, _owner, recipeId) => {
        photos.push(recipeId);
        return true;
      },
    });
    expect(replanned).toHaveLength(1);
    expect(replanned[0]).toMatchObject({ recipeId: withoutPhoto, photoStarted: true });
    expect(photos).toEqual([withoutPhoto]);
    // La recette écartée n'est plus proposée.
    expect((await recipeSchedule(db, reelRecipe, NOW)).some((p) => p.status === "proposed")).toBe(false);
  });

  it("plus aucune recette disponible : rien n'est proposé (pas de photo si le quota manque)", async () => {
    const db = testDb();
    const later = new Date(NOW.getTime() + 7 * 24 * 3600 * 1000);
    expect(
      await planUpcoming(db, { now: later, onlyOwner: admin.id, startPhoto: async () => false }),
    ).toEqual([]);
  });
});
