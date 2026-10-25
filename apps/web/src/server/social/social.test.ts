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
import { replyToComments } from "./comment-reply";
import { savePinterestBoard } from "./pinterest-board";
import { carouselJobs, completeCarousel, latestCarousel, registerCarousel, slideKey } from "./carousels";
import { advancePublication, captionFor, startPublication } from "./publish";
import {
  cancelScheduled,
  recipeSchedule,
  runDueSchedules,
  schedulePublication,
  suggestSlot,
} from "./schedule";
import { analyzeStats, collectStats, engagementRate, statsOverview } from "./stats";
import { createVideoStorage, parseRange } from "./video-storage";
import { loadRecipeView } from "../generation/view";
import { completeVideo, latestVideo, registerVideo, requestVideo, videoJobs } from "./videos";

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
  await db.insert(s.recipeImages).values({
    recipeVersionId: versionId,
    format: "4:5",
    sourceImageId: source!.id,
    status: "ready",
    storageKey: "x/45.jpg",
    width: 1152,
    height: 1440,
  });
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

/** Épingle Pinterest dans la vue d'ensemble des statistiques. */
function overview0(overview: Awaited<ReturnType<typeof statsOverview>>) {
  return overview.posts.find((p) => p.postUrl === "https://www.pinterest.com/pin/987654321/");
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
    PINTEREST_APP_ID: process.env.PINTEREST_APP_ID,
    PINTEREST_APP_SECRET: process.env.PINTEREST_APP_SECRET,
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
    process.env.PINTEREST_APP_ID = "1500000";
    process.env.PINTEREST_APP_SECRET = "p".repeat(40);
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

  it("refaire la vidéo dans un autre format (coupe, vue du dessus…), à la demande de l'administrateur", async () => {
    const db = testDb();
    const cook = await createTestUser();
    expect(await requestVideo(db, cook.id, recipeId, "coupe")).toBe(false);
    expect(await requestVideo(db, admin.id, recipeId, "coupe")).toBe(true);
    // La recette repasse dans la file de l'agent, avec le format demandé.
    const job = (await videoJobs(db, "https://culinova.fr")).find((j) => j.recipeId === recipeId);
    expect(job?.format).toBe("coupe");
    expect((await latestVideo(db, recipeId))?.pendingRequest).toBe("coupe");
    const registered = await registerVideo(db, {
      recipeId,
      versionId: job!.versionId,
      imageId: job!.imageId,
      format: "coupe",
      durationS: 20,
      width: 1080,
      height: 1920,
      sizeBytes: 4,
    });
    if (!registered.ok) throw new Error(registered.reason);
    const [row] = await db.select().from(s.recipeVideos).where(eq(s.recipeVideos.id, registered.videoId));
    await createVideoStorage().put(row!.storageKey, new Uint8Array([1, 2, 3, 4]));
    expect(await completeVideo(db, registered.videoId, { status: "ready" })).toEqual({ ok: true });
    // Nouvelle vidéo au bon format, demande satisfaite : plus rien à refaire.
    expect(await latestVideo(db, recipeId)).toMatchObject({ format: "coupe", pendingRequest: null });
    expect((await videoJobs(db, "https://culinova.fr")).some((j) => j.recipeId === recipeId)).toBe(false);
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
      await startPublication(db, admin.id, recipeId, "instagram", "video", {}, { fetchImpl: network.impl }),
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
        and(
          eq(s.recipePublications.platform, "instagram"),
          eq(s.recipePublications.recipeId, recipeId),
          eq(s.recipePublications.format, "video"),
        ),
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
      promoteOwnBrand: false,
      brandedContent: false,
    };
    expect(
      await startPublication(
        db,
        admin.id,
        recipeId,
        "tiktok",
        "video",
        { tiktok: choices },
        { fetchImpl: network.impl },
      ),
    ).toEqual({
      ok: false,
      reason: "invalid_privacy",
    });
    // Règle de TikTok : un contenu de marque ne peut pas être privé.
    expect(
      await startPublication(
        db,
        admin.id,
        recipeId,
        "tiktok",
        "video",
        { tiktok: { ...choices, privacy: "SELF_ONLY", brandedContent: true } },
        { fetchImpl: network.impl },
      ),
    ).toEqual({ ok: false, reason: "invalid_privacy" });
    expect(
      await startPublication(
        db,
        admin.id,
        recipeId,
        "tiktok",
        "video",
        { tiktok: { ...choices, privacy: "SELF_ONLY" } },
        { fetchImpl: network.impl },
      ),
    ).toEqual({ ok: true });
    const init = JSON.parse(network.calls.find((c) => /video\/init/.test(c.url))!.body!);
    expect(init.post_info).toMatchObject({
      privacy_level: "SELF_ONLY",
      disable_comment: false,
      disable_duet: true,
      brand_content_toggle: false,
      brand_organic_toggle: false,
      is_aigc: true,
      video_cover_timestamp_ms: 1000,
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

  it("carrousel et photo Instagram : fabriqués d'après la photo, publiés avec la légende validée", async () => {
    const db = testDb();
    const job = (await carouselJobs(db, "https://culinova.fr")).find((j) => j.recipeId === recipeId);
    // La recette n'est plus « à publier » (déjà publiée) : on demande ce carrousel précisément.
    const forced = job ?? (await carouselJobs(db, "https://culinova.fr", { recipeId }))[0];
    expect(forced?.ingredients.length).toBeGreaterThan(0);
    expect(forced?.steps.length).toBeGreaterThan(2);
    expect(forced?.photoUrl).toContain("/api/agent/images/");

    const registered = await registerCarousel(db, {
      recipeId,
      versionId: forced!.versionId,
      imageId: forced!.imageId,
      slideCount: 3,
    });
    if (!registered.ok) throw new Error(registered.reason);
    expect(registered.uploads).toHaveLength(3);
    const [row] = await db
      .select()
      .from(s.recipeCarousels)
      .where(eq(s.recipeCarousels.id, registered.carouselId));
    expect(await completeCarousel(db, registered.carouselId, { status: "ready" })).toEqual({
      ok: false,
      reason: "file_missing",
    });
    for (let slide = 1; slide <= 3; slide++) {
      await createVideoStorage().put(
        slideKey(row!.storagePrefix, slide),
        new Uint8Array([slide]),
        "image/jpeg",
      );
    }
    expect(await completeCarousel(db, registered.carouselId, { status: "ready" })).toEqual({ ok: true });
    expect(await latestCarousel(db, recipeId)).toMatchObject({ slideCount: 3, current: true });

    const calls: Array<{ url: string; body: string }> = [];
    let child = 0;
    const impl = (async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      const body = init?.body ? String(init.body) : "";
      calls.push({ url, body });
      if (/\/media_publish/.test(url)) return Response.json({ id: "m-car" });
      if (/\/17841\/media$/.test(url)) {
        if (body.includes("is_carousel_item=true")) return Response.json({ id: `child-${++child}` });
        if (body.includes("media_type=CAROUSEL")) return Response.json({ id: "car-1" });
        return Response.json({ id: "img-1" });
      }
      if (/\/(car-1|img-1)\?/.test(url)) return Response.json({ status_code: "FINISHED" });
      return Response.json({ permalink: "https://www.instagram.com/p/xyz/" });
    }) as typeof fetch;

    expect(
      await startPublication(
        db,
        admin.id,
        recipeId,
        "instagram",
        "carousel",
        { caption: "Ma légende avec @maison.dupont #baghrir" },
        { fetchImpl: impl },
      ),
    ).toEqual({ ok: true });
    const parent = calls.find((c) => c.body.includes("media_type=CAROUSEL"));
    expect(new URLSearchParams(parent!.body).get("children")).toBe("child-1,child-2,child-3");
    // Légende validée, complétée par l'adresse de la page publique de la recette.
    const sent = new URLSearchParams(parent!.body).get("caption")!;
    // Légende modifiée à la main : invitation « Commente RECETTE » puis lien de la recette, ajoutés d'office.
    expect(sent.startsWith("Ma légende avec @maison.dupont #baghrir\n\n💬 Commente « RECETTE »")).toBe(true);
    expect(sent).toContain("\n\n🔗");
    expect(sent).toMatch(/\/recette\/[a-z0-9-]+ \(lien dans la bio\)$/);
    expect(decodeURIComponent(calls[0]!.body)).toContain(
      `/api/social/carrousels/${registered.carouselId}/1?`,
    );

    expect(
      await startPublication(db, admin.id, recipeId, "instagram", "photo", {}, { fetchImpl: impl }),
    ).toEqual({ ok: true });
    const photoCall = calls.find(
      (c) => /\/media$/.test(c.url) && !c.body.includes("is_carousel_item") && !c.body.includes("CAROUSEL"),
    );
    expect(decodeURIComponent(photoCall!.body)).toContain("/api/agent/images/");
    // TikTok ne publie que des vidéos.
    expect(await startPublication(db, admin.id, recipeId, "tiktok", "photo")).toEqual({
      ok: false,
      reason: "invalid_format",
    });

    const rows = await db
      .select()
      .from(s.recipePublications)
      .where(
        and(eq(s.recipePublications.recipeId, recipeId), eq(s.recipePublications.platform, "instagram")),
      );
    expect(rows.map((r) => r.format).sort()).toEqual(["carousel", "photo", "video"]);
    for (const publication of rows.filter((r) => r.status === "processing")) {
      expect(await advancePublication(db, publication.id, { fetchImpl: impl })).toBe("published");
    }
  });

  it("Pinterest : épingle la photo sur le tableau choisi, avec un lien vers culinova.fr", async () => {
    const db = testDb();
    const now = new Date();
    await saveAccount(db, admin.id, {
      platform: "pinterest",
      accountId: "culinova",
      username: "culinova",
      accessToken: "pina_test",
      refreshToken: "pinr_test",
      expiresAt: new Date(now.getTime() + 30 * 86400_000),
      refreshExpiresAt: new Date(now.getTime() + 365 * 86400_000),
      scopes: ["pins:write"],
    });
    const network = fakeNetwork([[/\/v5\/pins$/, { id: "987654321" }]]);
    // Sans tableau choisi, rien n'est épinglé.
    expect(
      await startPublication(db, admin.id, recipeId, "pinterest", "photo", {}, { fetchImpl: network.impl }),
    ).toEqual({ ok: false, reason: "no_board" });
    await savePinterestBoard(db, admin.id, { boardId: "112233", boardName: "Recettes Culinova" });
    expect(await startPublication(db, admin.id, recipeId, "pinterest", "video")).toEqual({
      ok: false,
      reason: "invalid_format",
    });
    expect(
      await startPublication(db, admin.id, recipeId, "pinterest", "photo", {}, { fetchImpl: network.impl }),
    ).toEqual({ ok: true });
    const pin = JSON.parse(network.calls.find((c) => /\/v5\/pins$/.test(c.url))!.body!);
    expect(pin.board_id).toBe("112233");
    expect(pin.title.length).toBeLessThanOrEqual(100);
    expect(pin.description.length).toBeLessThanOrEqual(800);
    expect(pin.description).not.toMatch(/@\w/);
    expect(pin.link).toContain("utm_source=pinterest");
    expect(pin.media_source).toMatchObject({ source_type: "image_url" });
    expect(pin.media_source.url).toContain("/api/agent/images/");
    const [row] = await db
      .select()
      .from(s.recipePublications)
      .where(
        and(eq(s.recipePublications.recipeId, recipeId), eq(s.recipePublications.platform, "pinterest")),
      );
    expect(row).toMatchObject({
      status: "published",
      format: "photo",
      postUrl: "https://www.pinterest.com/pin/987654321/",
    });
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
      [/\/v5\/user_account/, { username: "culinova", follower_count: 25 }],
      [/\/v5\/pins\/987654321\/analytics/, { all: { summary_metrics: { IMPRESSION: 300, SAVE: 12 } } }],
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
    expect(await collectStats(db, { fetchImpl: network.impl })).toEqual({
      instagram: "ok",
      tiktok: "ok",
      pinterest: "ok",
    });
    const pin = overview0(await statsOverview(db));
    expect(pin?.metrics).toMatchObject({ views: 300, saves: 12 });
    const overview = await statsOverview(db);
    expect(overview.accounts.find((a) => a.platform === "instagram")?.followers).toBe(120);
    const reel = overview.posts.find((p) => p.postUrl === "https://www.instagram.com/reel/abc/");
    expect(reel?.metrics).toMatchObject({ views: 1000, saves: 35 });
    expect(reel?.engagementRate).toBe(10);

    const analysis = await analyzeStats(db, new FakeLlmAdapter(), admin.id);
    expect(analysis.ok).toBe(true);
    expect((await statsOverview(db)).lastAnalysis?.analysis.suggestions.length).toBeGreaterThan(0);
  });

  it("programmation : la publication validée part toute seule à l'heure prévue, une seule fois", async () => {
    const db = testDb();
    const network = fakeNetwork([[/\/v5\/pins$/, { id: "555000111" }]]);
    const now = new Date();
    const at = new Date(now.getTime() + 2 * 3600 * 1000);
    // Date passée ou trop lointaine, format absent du réseau, recette d'un autre compte : refusés.
    expect(
      await schedulePublication(
        db,
        admin.id,
        { recipeId, platform: "pinterest", format: "photo", at: now },
        now,
      ),
    ).toEqual({ ok: false, reason: "invalid_date" });
    expect(
      await schedulePublication(
        db,
        admin.id,
        { recipeId, platform: "pinterest", format: "photo", at: new Date(now.getTime() + 90 * 86400_000) },
        now,
      ),
    ).toEqual({ ok: false, reason: "invalid_date" });
    expect(
      await schedulePublication(db, admin.id, { recipeId, platform: "pinterest", format: "video", at }, now),
    ).toEqual({ ok: false, reason: "invalid_format" });
    const cook = await createTestUser();
    expect(
      await schedulePublication(db, cook.id, { recipeId, platform: "pinterest", format: "photo", at }, now),
    ).toEqual({ ok: false, reason: "not_found" });
    // TikTok : la confidentialité est choisie à la validation, pas au moment du départ.
    expect(
      await schedulePublication(db, admin.id, { recipeId, platform: "tiktok", format: "video", at }, now),
    ).toEqual({ ok: false, reason: "invalid_privacy" });

    const scheduled = await schedulePublication(
      db,
      admin.id,
      { recipeId, platform: "pinterest", format: "photo", at, caption: "Ma légende validée" },
      now,
    );
    expect(scheduled.ok).toBe(true);
    expect((await recipeSchedule(db, recipeId, now)).map((p) => p.status)).toContain("scheduled");
    expect((await loadRecipeView(db, recipeId, admin.id))?.publishing?.schedule.length).toBeGreaterThan(0);
    // Le créneau conseillé suivant saute celui qui vient d'être pris.
    const next = await suggestSlot(db, "pinterest", now);
    expect(next && Math.abs(next.getTime() - at.getTime())).toBeGreaterThanOrEqual(3600 * 1000);

    // Avant l'heure : rien ne part.
    expect(await runDueSchedules(db, { fetchImpl: network.impl, now })).toEqual([]);
    expect(network.calls).toHaveLength(0);
    // À l'heure : l'épingle part avec la légende validée, puis plus jamais.
    const later = new Date(at.getTime() + 5 * 60 * 1000);
    expect(await runDueSchedules(db, { fetchImpl: network.impl, now: later })).toContain("started");
    expect(await runDueSchedules(db, { fetchImpl: network.impl, now: later })).toEqual([]);
    const pins = network.calls.filter((c) => /\/v5\/pins$/.test(c.url));
    expect(pins).toHaveLength(1);
    expect(JSON.parse(pins[0]!.body!).description).toContain("Ma légende validée");
    const [row] = await db
      .select()
      .from(s.scheduledPublications)
      .where(eq(s.scheduledPublications.id, scheduled.ok ? scheduled.id : ""));
    expect(row).toMatchObject({ status: "started" });

    // Annulation : seulement par l'administrateur qui l'a programmée.
    const toCancel = await schedulePublication(
      db,
      admin.id,
      { recipeId, platform: "pinterest", format: "photo", at },
      now,
    );
    if (!toCancel.ok) throw new Error(toCancel.reason);
    expect(await cancelScheduled(db, cook.id, toCancel.id)).toBe(false);
    expect(await cancelScheduled(db, admin.id, toCancel.id)).toBe(true);
    expect(await runDueSchedules(db, { fetchImpl: network.impl, now: later })).toEqual([]);

    // Service arrêté plus de 6 h : le créneau est manqué, rien ne part en pleine nuit.
    const missed = await schedulePublication(
      db,
      admin.id,
      { recipeId, platform: "pinterest", format: "photo", at },
      now,
    );
    if (!missed.ok) throw new Error(missed.reason);
    expect(
      await runDueSchedules(db, { fetchImpl: network.impl, now: new Date(at.getTime() + 7 * 3600 * 1000) }),
    ).toEqual(["missed"]);
    const failed = (await recipeSchedule(db, recipeId)).find((p) => p.id === missed.id);
    expect(failed).toMatchObject({ status: "failed" });
    expect(failed?.note).toMatch(/reprogrammez/);
    expect(network.calls.filter((c) => /\/v5\/pins$/.test(c.url))).toHaveLength(1);

    // Proposition de la planification automatique non validée à l'heure : elle expire, rien ne part.
    const proposedAt = new Date(now.getTime() + 3 * 3600 * 1000);
    const [proposal] = await db
      .insert(s.scheduledPublications)
      .values({
        recipeId,
        platform: "pinterest",
        format: "photo",
        scheduledAt: proposedAt,
        status: "proposed",
        createdBy: admin.id,
      })
      .returning();
    expect(
      await runDueSchedules(db, { fetchImpl: network.impl, now: new Date(proposedAt.getTime() + 60_000) }),
    ).toContain("expired");
    const [expiredRow] = await db
      .select()
      .from(s.scheduledPublications)
      .where(eq(s.scheduledPublications.id, proposal!.id));
    expect(expiredRow).toMatchObject({ status: "expired" });
    expect(network.calls.filter((c) => /\/v5\/pins$/.test(c.url))).toHaveLength(1);
  });

  it("Commente RECETTE : le lien de la recette part en message privé, une seule fois par commentaire", async () => {
    const db = testDb();
    const now = new Date();
    const dish = await recipeOf(admin.id);
    await addPhoto(dish);
    await db.insert(s.recipePublications).values({
      recipeId: dish,
      platform: "instagram",
      format: "photo",
      status: "published",
      postId: "media-777",
      publishedAt: now,
    });
    const network = fakeNetwork([
      [
        /\/media-777\/comments/,
        {
          data: [
            {
              id: "c1",
              text: "Recette !",
              timestamp: now.toISOString(),
              username: "marie",
              from: { id: "u1" },
            },
            {
              id: "c2",
              text: "Trop beau",
              timestamp: now.toISOString(),
              username: "paul",
              from: { id: "u2" },
            },
            {
              id: "c3",
              text: "RECETTE",
              timestamp: now.toISOString(),
              username: "culinova.recette",
              from: { id: "17841" },
            },
          ],
        },
      ],
      [/\/17841\/messages$/, { recipient_id: "u1", message_id: "m1" }],
      [/\/c1\/replies$/, { id: "r1" }],
    ]);
    // Seul le commentaire de Marie contient le mot-clé (jamais le compte lui-même).
    expect(await replyToComments(db, { fetchImpl: network.impl, now })).toEqual({ sent: 1, failed: 0 });
    const sent = network.calls.find((c) => /\/messages$/.test(c.url));
    const body = JSON.parse(sent!.body!);
    expect(body.recipient).toEqual({ comment_id: "c1" });
    expect(body.message.text).toContain("@marie");
    expect(body.message.text).toMatch(/\/recette\/[a-z0-9-]+\?utm_source=instagram/);
    expect(network.calls.some((c) => /\/c1\/replies$/.test(c.url))).toBe(true);
    // Passage suivant : rien n'est renvoyé.
    expect(await replyToComments(db, { fetchImpl: network.impl, now })).toEqual({ sent: 0, failed: 0 });
    expect(network.calls.filter((c) => /\/messages$/.test(c.url))).toHaveLength(1);
    // La légende Instagram proposée invite à commenter le mot-clé.
    const [recipe] = await db.select().from(s.recipes).where(eq(s.recipes.id, dish));
    expect(await captionFor(db, recipe!.currentVersionId!, "instagram")).toContain("💬 Commente « RECETTE »");
    expect(await captionFor(db, recipe!.currentVersionId!, "tiktok")).not.toContain("Commente");
  });

  it("réservé à l'administrateur : aucune automatisation pour les autres comptes", async () => {
    const db = testDb();
    const cook = await createTestUser();
    const cookRecipe = await recipeOf(cook.id);
    await addPhoto(cookRecipe);
    // Pas d'encart de publication sur ses recettes.
    expect((await loadRecipeView(db, cookRecipe, cook.id))?.publishing).toBeNull();
    // Ni file « à publier », ni publication, même en visant la recette d'un administrateur.
    expect(await queuePublication(db, cook.id, cookRecipe, ["instagram"])).toBe(false);
    expect(await queuePublication(db, cook.id, recipeId, ["instagram"])).toBe(false);
    expect(await startPublication(db, cook.id, cookRecipe, "instagram", "photo")).toMatchObject({
      ok: false,
      reason: "not_found",
    });
    expect(await startPublication(db, cook.id, recipeId, "instagram", "photo")).toMatchObject({
      ok: false,
      reason: "not_found",
    });
    // Même une ligne « à publier » glissée en base n'ouvre rien à l'agent.
    await db
      .insert(s.recipePublications)
      .values({ recipeId: cookRecipe, platform: "tiktok", status: "queued" });
    expect((await videoJobs(db, "https://culinova.fr")).some((j) => j.recipeId === cookRecipe)).toBe(false);
    expect((await carouselJobs(db, "https://culinova.fr")).some((j) => j.recipeId === cookRecipe)).toBe(
      false,
    );
    expect(await videoJobs(db, "https://culinova.fr", { recipeId: cookRecipe })).toEqual([]);
    const [version] = await db.select().from(s.recipes).where(eq(s.recipes.id, cookRecipe));
    expect(
      await registerVideo(db, {
        recipeId: cookRecipe,
        versionId: version!.currentVersionId!,
        durationS: 10,
        width: 1080,
        height: 1920,
        sizeBytes: 10,
      }),
    ).toEqual({ ok: false, reason: "recipe_not_found" });
  });

  it("nouvelle photo : la vidéo n'est plus publiable et une nouvelle est demandée", async () => {
    const db = testDb();
    const photoId = await addPhoto(recipeId);
    expect((await latestVideo(db, recipeId))?.current).toBe(false);
    await queuePublication(db, admin.id, recipeId, ["instagram"]);
    const job = (await videoJobs(db, "https://culinova.fr")).find((j) => j.recipeId === recipeId);
    expect(job?.imageId).toBe(photoId);
    expect(await startPublication(db, admin.id, recipeId, "instagram", "video")).toEqual({
      ok: false,
      reason: "outdated",
    });
  });
});
