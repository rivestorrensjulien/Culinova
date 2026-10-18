/** Agent de publication : vidéos, comptes reliés, publication validée et statistiques. */
import { FakeLlmAdapter } from "@culinova/ai";
import * as s from "@culinova/db/schema";
import { and, eq } from "drizzle-orm";
import { randomBytes } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { emptyWizardState, type WizardState } from "@/lib/wizard";
import { createTestUser, hasTestDb, testDb } from "@/test/db";
import { runGeneration } from "../generation/run";
import { startRecipeGeneration } from "../generation/start";
import { publicationStatuses, queuePublication, signedVideoPath, verifyVideoSignature } from "../publishing";
import { accountToken, listAccounts, saveAccount } from "./accounts";
import { advancePublication, captionFor, startPublication } from "./publish";
import { analyzeStats, collectStats, engagementRate, statsOverview } from "./stats";
import { createVideoStorage, parseRange } from "./video-storage";
import { completeVideo, latestVideo, registerVideo, videoJobs } from "./videos";

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

/** Photo de la version active : image HD principale et son recadrage 9:16. */
async function addPhoto(recipeId: string): Promise<string> {
  const db = testDb();
  const [recipe] = await db.select().from(s.recipes).where(eq(s.recipes.id, recipeId));
  const versionId = recipe!.currentVersionId!;
  await db
    .update(s.recipeImages)
    .set({ isPrimary: false })
    .where(eq(s.recipeImages.recipeVersionId, versionId));
  const [source] = await db
    .insert(s.recipeImages)
    .values({
      recipeVersionId: versionId,
      format: "source",
      status: "ready",
      isPrimary: true,
      storageKey: "x/src.jpg",
    })
    .returning();
  const [vertical] = await db
    .insert(s.recipeImages)
    .values({
      recipeVersionId: versionId,
      format: "9:16",
      sourceImageId: source!.id,
      status: "ready",
      storageKey: "x/916.jpg",
      width: 810,
      height: 1440,
    })
    .returning();
  return vertical!.id;
}

/** Faux réseau : chaque route renvoie la réponse prévue (ou une suite de réponses). */
function fakeNetwork(routes: Array<[RegExp, unknown | (() => unknown)]>) {
  const calls: Array<{ url: string; body: string | null }> = [];
  const impl = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    calls.push({ url, body: init?.body ? String(init.body) : null });
    const route = routes.find(([pattern]) => pattern.test(url));
    if (!route) return Response.json({ error: { message: `route inconnue ${url}` } }, { status: 404 });
    const value = typeof route[1] === "function" ? (route[1] as () => unknown)() : route[1];
    return Response.json(value);
  }) as typeof fetch;
  return { impl, calls };
}

describe("liens de vidéo et lecture partielle", () => {
  it("signe des liens de vidéo valables 6 heures, distincts des liens de photo", () => {
    const env = { AGENT_API_KEY: "v".repeat(40) };
    const now = new Date("2026-10-18T10:00:00Z");
    const url = new URL(signedVideoPath("vid", now, env)!, "https://culinova.fr");
    const expire = url.searchParams.get("expire");
    const signature = url.searchParams.get("signature");
    expect(url.pathname).toBe("/api/social/videos/vid");
    expect(verifyVideoSignature("vid", expire, signature, new Date("2026-10-18T15:59:00Z"), env)).toBe(true);
    expect(verifyVideoSignature("vid", expire, signature, new Date("2026-10-18T16:01:00Z"), env)).toBe(false);
    expect(verifyVideoSignature("autre", expire, signature, now, env)).toBe(false);
  });

  it("lit les plages d'octets demandées par les lecteurs vidéo", () => {
    expect(parseRange("bytes=0-99", 1000)).toEqual({ start: 0, end: 99 });
    expect(parseRange("bytes=900-", 1000)).toEqual({ start: 900, end: 999 });
    expect(parseRange("bytes=-100", 1000)).toEqual({ start: 900, end: 999 });
    expect(parseRange("bytes=2000-", 1000)).toBeNull();
    expect(parseRange(null, 1000)).toBeNull();
  });

  it("calcule le taux d'interaction pour 100 vues", () => {
    expect(engagementRate({ views: 200, reach: null, likes: 10, comments: 2, shares: 3, saves: 5 })).toBe(10);
    expect(engagementRate({ views: 0, reach: null, likes: 1, comments: 0, shares: 0, saves: 0 })).toBeNull();
  });
});

describe.skipIf(!hasTestDb)("agent de publication", () => {
  let admin: { id: string; email: string };
  let recipeId: string;

  const saved = {
    AGENT_API_KEY: process.env.AGENT_API_KEY,
    SOCIAL_TOKEN_KEY: process.env.SOCIAL_TOKEN_KEY,
    IMAGE_STORAGE_DIR: process.env.IMAGE_STORAGE_DIR,
  };
  afterAll(() => {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  beforeAll(async () => {
    process.env.AGENT_API_KEY = "a".repeat(40);
    process.env.SOCIAL_TOKEN_KEY = randomBytes(32).toString("base64");
    process.env.IMAGE_STORAGE_DIR = join(tmpdir(), `culinova-test-${randomBytes(4).toString("hex")}`);
    admin = await createTestUser({ role: "admin" });
    recipeId = await recipeOf(admin.id);
    await queuePublication(testDb(), admin.id, recipeId, ["instagram", "tiktok"]);
  });

  it("fabrique, reçoit et montre la vidéo de la recette", async () => {
    const db = testDb();
    // Pas de vidéo sans la photo de la recette : la vidéo montre exactement ce plat.
    expect((await videoJobs(db, "https://culinova.fr")).some((j) => j.recipeId === recipeId)).toBe(false);
    const photoId = await addPhoto(recipeId);
    const jobs = await videoJobs(db, "https://culinova.fr");
    const job = jobs.find((j) => j.recipeId === recipeId);
    expect(job?.imageId).toBe(photoId);
    expect(job?.photoUrl).toContain(`/api/agent/images/${photoId}?`);
    expect(job).toMatchObject({
      hook: "Regardez le chalumeau faire son œuvre…",
      shots: [
        "Disposer les ingrédients sur le plan de travail",
        "Saisir le saumon au chalumeau",
        "Dresser l'assiette",
      ],
    });

    const registered = await registerVideo(db, {
      recipeId,
      versionId: job!.versionId,
      imageId: job!.imageId,
      durationS: 21.5,
      width: 1080,
      height: 1920,
      sizeBytes: 4,
    });
    if (!registered.ok) throw new Error(registered.reason);
    expect(registered.upload.url).toBe(`/api/agent/videos/${registered.videoId}/fichier`);
    // Fichier absent : la vidéo n'est pas déclarée prête.
    expect(await completeVideo(db, registered.videoId, { status: "ready" })).toEqual({
      ok: false,
      reason: "file_missing",
    });
    const [row] = await db.select().from(s.recipeVideos).where(eq(s.recipeVideos.id, registered.videoId));
    await createVideoStorage().put(row!.storageKey, new Uint8Array([1, 2, 3, 4]));
    expect(await completeVideo(db, registered.videoId, { status: "ready" })).toEqual({ ok: true });

    expect(await latestVideo(db, recipeId)).toMatchObject({
      id: registered.videoId,
      durationS: 21.5,
      current: true,
    });
    expect((await videoJobs(db, "https://culinova.fr")).some((j) => j.recipeId === recipeId)).toBe(false);
    // Une recette précise : toujours possible de refaire la vidéo.
    expect(await videoJobs(db, "https://culinova.fr", { recipeId })).toHaveLength(1);
    const read = await createVideoStorage().read(row!.storageKey, "bytes=1-2");
    expect(read?.status).toBe(206);
    expect(new Uint8Array(await read!.arrayBuffer())).toEqual(new Uint8Array([2, 3]));
  });

  it("garde les jetons chiffrés et publie un Reel après validation", async () => {
    const db = testDb();
    const now = new Date();
    await saveAccount(db, admin.id, {
      platform: "instagram",
      accountId: "17841",
      username: "culinova.recette",
      accessToken: "IG-SECRET-TOKEN",
      refreshToken: null,
      expiresAt: new Date(now.getTime() + 30 * 86400_000),
      refreshExpiresAt: null,
      scopes: [],
    });
    const [stored] = await db
      .select()
      .from(s.socialAccounts)
      .where(eq(s.socialAccounts.platform, "instagram"));
    expect(stored!.accessTokenEnc).not.toContain("IG-SECRET-TOKEN");
    expect((await accountToken(db, "instagram"))?.accessToken).toBe("IG-SECRET-TOKEN");
    expect((await listAccounts(db)).find((a) => a.platform === "instagram")?.username).toBe(
      "culinova.recette",
    );

    let polls = 0;
    const network = fakeNetwork([
      [/\/17841\/media_publish/, { id: "m-1" }],
      [/\/17841\/media/, { id: "c-1" }],
      [/\/c-1\?/, () => ({ status_code: polls++ === 0 ? "IN_PROGRESS" : "FINISHED" })],
      [/\/m-1\?/, { permalink: "https://www.instagram.com/reel/abc/" }],
    ]);
    expect(
      await startPublication(db, admin.id, recipeId, "instagram", null, { fetchImpl: network.impl }),
    ).toEqual({
      ok: true,
    });
    const create = network.calls.find((c) => /\/media$/.test(c.url));
    expect(create?.body).toContain("media_type=REELS");
    expect(decodeURIComponent(create!.body!)).toContain("/api/social/videos/");
    const statuses = await publicationStatuses(db, recipeId);
    expect(statuses.find((p) => p.platform === "instagram")?.status).toBe("processing");

    const [publication] = await db
      .select()
      .from(s.recipePublications)
      .where(
        and(eq(s.recipePublications.platform, "instagram"), eq(s.recipePublications.recipeId, recipeId)),
      );
    expect(await advancePublication(db, publication!.id, { fetchImpl: network.impl })).toBe("processing");
    expect(await advancePublication(db, publication!.id, { fetchImpl: network.impl })).toBe("published");
    const [after] = await db
      .select()
      .from(s.recipePublications)
      .where(eq(s.recipePublications.id, publication!.id));
    expect(after).toMatchObject({
      status: "published",
      postId: "m-1",
      postUrl: "https://www.instagram.com/reel/abc/",
    });
  });

  it("TikTok : confidentialité choisie parmi celles du compte, puis suivi de la publication", async () => {
    const db = testDb();
    const now = new Date();
    await saveAccount(db, admin.id, {
      platform: "tiktok",
      accountId: "open-1",
      username: "culinova.recette",
      accessToken: "TT-TOKEN",
      refreshToken: "TT-REFRESH",
      expiresAt: new Date(now.getTime() + 86400_000),
      refreshExpiresAt: new Date(now.getTime() + 300 * 86400_000),
      scopes: ["video.publish"],
    });
    const network = fakeNetwork([
      [
        /creator_info/,
        {
          data: {
            creator_nickname: "Culinova",
            creator_username: "culinova.recette",
            privacy_level_options: ["SELF_ONLY"],
            comment_disabled: false,
            duet_disabled: true,
            stitch_disabled: true,
            max_video_post_duration_sec: 600,
          },
          error: { code: "ok" },
        },
      ],
      [/video\/init/, { data: { publish_id: "p-1" }, error: { code: "ok" } }],
      [
        /status\/fetch/,
        { data: { status: "PUBLISH_COMPLETE", publicaly_available_post_id: [7123] }, error: { code: "ok" } },
      ],
    ]);
    const choices = {
      privacy: "PUBLIC_TO_EVERYONE",
      allowComments: true,
      allowDuet: true,
      allowStitch: false,
    };
    expect(
      await startPublication(db, admin.id, recipeId, "tiktok", choices, { fetchImpl: network.impl }),
    ).toEqual({
      ok: false,
      reason: "invalid_privacy",
    });
    expect(
      await startPublication(
        db,
        admin.id,
        recipeId,
        "tiktok",
        { ...choices, privacy: "SELF_ONLY" },
        { fetchImpl: network.impl },
      ),
    ).toEqual({ ok: true });
    const init = JSON.parse(network.calls.find((c) => /video\/init/.test(c.url))!.body!);
    expect(init.post_info).toMatchObject({
      privacy_level: "SELF_ONLY",
      disable_comment: false,
      disable_duet: true,
    });
    expect(init.source_info.source).toBe("PULL_FROM_URL");
    expect(init.post_info.title).toContain("#");

    const [publication] = await db
      .select()
      .from(s.recipePublications)
      .where(and(eq(s.recipePublications.platform, "tiktok"), eq(s.recipePublications.recipeId, recipeId)));
    expect(await advancePublication(db, publication!.id, { fetchImpl: network.impl })).toBe("published");
    const [after] = await db
      .select()
      .from(s.recipePublications)
      .where(eq(s.recipePublications.id, publication!.id));
    expect(after?.postUrl).toBe("https://www.tiktok.com/@culinova.recette/video/7123");
  });

  it("légende : texte du réseau suivi des hashtags", async () => {
    const db = testDb();
    const [recipe] = await db.select().from(s.recipes).where(eq(s.recipes.id, recipeId));
    const caption = await captionFor(db, recipe!.currentVersionId!, "instagram");
    expect(caption).toMatch(/#\S+/);
    expect(caption.length).toBeLessThanOrEqual(2200);
  });

  it("relève les statistiques et les analyse", async () => {
    const db = testDb();
    const network = fakeNetwork([
      [
        /graph\.instagram\.com\/v[\d.]+\/me\?/,
        { user_id: "17841", username: "culinova.recette", followers_count: 120, media_count: 4 },
      ],
      [
        /\/m-1\/insights/,
        {
          data: [
            { name: "views", values: [{ value: 1000 }] },
            { name: "reach", values: [{ value: 800 }] },
            { name: "likes", values: [{ value: 50 }] },
            { name: "comments", values: [{ value: 5 }] },
            { name: "shares", values: [{ value: 10 }] },
            { name: "saved", values: [{ value: 35 }] },
          ],
        },
      ],
      [
        /user\/info/,
        {
          data: { user: { open_id: "open-1", follower_count: 40, likes_count: 300, video_count: 2 } },
          error: { code: "ok" },
        },
      ],
      [
        /video\/list/,
        {
          data: {
            videos: [{ id: "7123", view_count: 500, like_count: 40, comment_count: 3, share_count: 7 }],
          },
          error: { code: "ok" },
        },
      ],
    ]);
    expect(await collectStats(db, { fetchImpl: network.impl })).toEqual({ instagram: "ok", tiktok: "ok" });
    const overview = await statsOverview(db);
    expect(overview.accounts.find((a) => a.platform === "instagram")?.followers).toBe(120);
    const reel = overview.posts.find((p) => p.recipeId === recipeId && p.platform === "instagram");
    expect(reel?.metrics).toMatchObject({ views: 1000, saves: 35 });
    expect(reel?.engagementRate).toBe(10);

    const analysis = await analyzeStats(db, new FakeLlmAdapter(), admin.id);
    expect(analysis.ok).toBe(true);
    expect((await statsOverview(db)).lastAnalysis?.analysis.suggestions.length).toBeGreaterThan(0);
  });

  it("nouvelle photo : la vidéo n'est plus publiable et une nouvelle est demandée", async () => {
    const db = testDb();
    const photoId = await addPhoto(recipeId);
    expect((await latestVideo(db, recipeId))?.current).toBe(false);
    await queuePublication(db, admin.id, recipeId, ["instagram"]);
    const job = (await videoJobs(db, "https://culinova.fr")).find((j) => j.recipeId === recipeId);
    expect(job?.imageId).toBe(photoId);
    expect(await startPublication(db, admin.id, recipeId, "instagram", null)).toEqual({
      ok: false,
      reason: "outdated",
    });
  });
});
