/**
 * Statistiques des réseaux : relevé quotidien (abonnés, vues, j'aime, commentaires,
 * partages, enregistrements), vue d'ensemble pour l'administration et analyse de l'IA
 * (prompt insights.analyze@1, gratuite, bornée par le plafond de budget IA).
 */
import {
  AiGenerationError,
  buildInsightsPrompt,
  type InsightsAnalysis,
  INSIGHTS_PROMPT_VERSION,
  insightsSchema,
  type LlmAdapter,
} from "@culinova/ai";
import { isWithinBudget } from "@culinova/core";
import type { Database } from "@culinova/db";
import * as s from "@culinova/db/schema";
import { and, asc, desc, eq, gte, isNotNull } from "drizzle-orm";
import { getAiBudgetCap, getAiSpend, recordAiSpend } from "../quotas";
import { accountToken, type SocialPlatform } from "./accounts";
import { instagramMediaInsights, instagramProfile, type PostMetrics } from "./instagram";
import { tiktokProfile, tiktokVideoList } from "./tiktok";

const DAY = 24 * 3600 * 1000;
/** Les publications sont suivies pendant 90 jours. */
const FOLLOW_DAYS = 90;
const ANALYSIS_COST_USD_MICROS = 60_000;

type CollectOutcome = "ok" | "not_connected" | { error: string };

async function publishedPosts(db: Database, platform: SocialPlatform, now: Date) {
  return db
    .select({ id: s.recipePublications.id, postId: s.recipePublications.postId })
    .from(s.recipePublications)
    .where(
      and(
        eq(s.recipePublications.platform, platform),
        eq(s.recipePublications.status, "published"),
        isNotNull(s.recipePublications.postId),
        gte(s.recipePublications.publishedAt, new Date(now.getTime() - FOLLOW_DAYS * DAY)),
      ),
    );
}

async function savePostStats(
  db: Database,
  publicationId: string,
  metrics: PostMetrics,
  raw: unknown,
  now: Date,
) {
  await db
    .insert(s.socialPostStats)
    .values({ publicationId, collectedAt: now, ...metrics, raw: raw as object });
}

/** Relevé des statistiques des comptes reliés (tâche quotidienne). */
export async function collectStats(
  db: Database,
  deps: { fetchImpl?: typeof fetch; now?: Date } = {},
): Promise<Record<SocialPlatform, CollectOutcome>> {
  const fetchImpl = deps.fetchImpl ?? fetch;
  const now = deps.now ?? new Date();
  const result = {} as Record<SocialPlatform, CollectOutcome>;

  const instagram = await accountToken(db, "instagram", { fetchImpl, now }).catch(() => null);
  if (!instagram) result.instagram = "not_connected";
  else {
    try {
      const profile = await instagramProfile(instagram.accessToken, fetchImpl);
      await db.insert(s.socialAccountStats).values({
        platform: "instagram",
        collectedAt: now,
        followers: profile.followers,
        posts: profile.posts,
      });
      for (const post of await publishedPosts(db, "instagram", now)) {
        const insights = await instagramMediaInsights(instagram.accessToken, post.postId!, fetchImpl).catch(
          () => null,
        );
        if (insights) await savePostStats(db, post.id, insights.metrics, insights.raw, now);
      }
      result.instagram = "ok";
    } catch (error) {
      result.instagram = { error: error instanceof Error ? error.message : String(error) };
    }
  }

  const tiktok = await accountToken(db, "tiktok", { fetchImpl, now }).catch(() => null);
  if (!tiktok) result.tiktok = "not_connected";
  else {
    try {
      const profile = await tiktokProfile(tiktok.accessToken, fetchImpl);
      await db.insert(s.socialAccountStats).values({
        platform: "tiktok",
        collectedAt: now,
        followers: profile.followers,
        posts: profile.videos,
        likes: profile.likes,
      });
      const videos = await tiktokVideoList(tiktok.accessToken, fetchImpl);
      for (const post of await publishedPosts(db, "tiktok", now)) {
        const video = videos.find((v) => v.id === post.postId);
        if (video) await savePostStats(db, post.id, video.metrics, video, now);
      }
      result.tiktok = "ok";
    } catch (error) {
      result.tiktok = { error: error instanceof Error ? error.message : String(error) };
    }
  }
  return result;
}

export interface AccountTrend {
  platform: SocialPlatform;
  followers: number | null;
  /** Abonnés gagnés (ou perdus) sur 7 jours. */
  followersDelta7d: number | null;
  /** Abonnés relevés chaque jour (30 derniers jours). */
  series: Array<{ date: string; followers: number | null }>;
  collectedAt: string | null;
}

export interface PostSummary {
  publicationId: string;
  recipeId: string;
  name: string;
  platform: SocialPlatform;
  publishedAt: string | null;
  postUrl: string | null;
  moment: string | null;
  cuisine: string | null;
  totalMinutes: number | null;
  metrics: PostMetrics | null;
  /** Interactions (j'aime + commentaires + partages + enregistrements) pour 100 vues. */
  engagementRate: number | null;
}

export interface StatsOverview {
  accounts: AccountTrend[];
  posts: PostSummary[];
  lastAnalysis: { createdAt: string; analysis: InsightsAnalysis } | null;
}

export function engagementRate(m: PostMetrics | null): number | null {
  if (!m?.views) return null;
  const interactions = (m.likes ?? 0) + (m.comments ?? 0) + (m.shares ?? 0) + (m.saves ?? 0);
  return Math.round((interactions / m.views) * 1000) / 10;
}

export async function statsOverview(db: Database, now = new Date()): Promise<StatsOverview> {
  const since = new Date(now.getTime() - 30 * DAY);
  const accountRows = await db
    .select()
    .from(s.socialAccountStats)
    .where(gte(s.socialAccountStats.collectedAt, since))
    .orderBy(asc(s.socialAccountStats.collectedAt));
  const accounts = (["instagram", "tiktok"] as const).map((platform): AccountTrend => {
    const rows = accountRows.filter((r) => r.platform === platform);
    const byDay = new Map<string, number | null>();
    for (const row of rows) byDay.set(row.collectedAt.toISOString().slice(0, 10), row.followers);
    const latest = rows.at(-1);
    const weekAgo = [...rows].reverse().find((r) => r.collectedAt.getTime() <= now.getTime() - 7 * DAY);
    return {
      platform,
      followers: latest?.followers ?? null,
      followersDelta7d:
        latest?.followers != null && weekAgo?.followers != null ? latest.followers - weekAgo.followers : null,
      series: [...byDay].map(([date, followers]) => ({ date, followers })),
      collectedAt: latest?.collectedAt.toISOString() ?? null,
    };
  });

  const publications = await db
    .select({
      id: s.recipePublications.id,
      recipeId: s.recipePublications.recipeId,
      platform: s.recipePublications.platform,
      publishedAt: s.recipePublications.publishedAt,
      postUrl: s.recipePublications.postUrl,
      name: s.recipeVersions.name,
      moment: s.mealMoments.code,
      cuisine: s.recipeVersions.cuisineLabel,
      prepS: s.recipeVersions.prepS,
      cookS: s.recipeVersions.cookS,
      restS: s.recipeVersions.restS,
    })
    .from(s.recipePublications)
    .innerJoin(s.recipes, eq(s.recipes.id, s.recipePublications.recipeId))
    .innerJoin(s.recipeVersions, eq(s.recipeVersions.id, s.recipes.currentVersionId))
    .leftJoin(s.mealMoments, eq(s.mealMoments.id, s.recipeVersions.momentId))
    .where(eq(s.recipePublications.status, "published"))
    .orderBy(desc(s.recipePublications.publishedAt))
    .limit(60);
  const posts: PostSummary[] = [];
  for (const p of publications) {
    const [latest] = await db
      .select()
      .from(s.socialPostStats)
      .where(eq(s.socialPostStats.publicationId, p.id))
      .orderBy(desc(s.socialPostStats.collectedAt))
      .limit(1);
    const metrics: PostMetrics | null = latest
      ? {
          views: latest.views,
          reach: latest.reach,
          likes: latest.likes,
          comments: latest.comments,
          shares: latest.shares,
          saves: latest.saves,
        }
      : null;
    const seconds = (p.prepS ?? 0) + (p.cookS ?? 0) + (p.restS ?? 0);
    posts.push({
      publicationId: p.id,
      recipeId: p.recipeId,
      name: p.name,
      platform: p.platform,
      publishedAt: p.publishedAt?.toISOString() ?? null,
      postUrl: p.postUrl,
      moment: p.moment,
      cuisine: p.cuisine,
      totalMinutes: seconds ? Math.round(seconds / 60) : null,
      metrics,
      engagementRate: engagementRate(metrics),
    });
  }

  const [analysis] = await db
    .select({ output: s.aiGenerations.output, createdAt: s.aiGenerations.createdAt })
    .from(s.aiGenerations)
    .where(and(eq(s.aiGenerations.kind, "social_analysis"), eq(s.aiGenerations.status, "succeeded")))
    .orderBy(desc(s.aiGenerations.createdAt))
    .limit(1);
  const parsed = analysis ? insightsSchema.safeParse(analysis.output) : null;
  return {
    accounts,
    posts,
    lastAnalysis: parsed?.success
      ? { createdAt: analysis!.createdAt.toISOString(), analysis: parsed.data }
      : null,
  };
}

type AnalyzeSuccess = { ok: true; analysis: InsightsAnalysis };
export type AnalyzeResult = AnalyzeSuccess | { ok: false; reason: "budget" | "failed" };

/** Analyse des statistiques par l'IA, avec des propositions pour toucher plus de monde. */
export async function analyzeStats(
  db: Database,
  ai: LlmAdapter,
  adminId: string,
  now = new Date(),
): Promise<AnalyzeResult> {
  const [cap, spent] = await Promise.all([getAiBudgetCap(db), getAiSpend(db)]);
  if (!isWithinBudget(spent, cap, ANALYSIS_COST_USD_MICROS)) return { ok: false, reason: "budget" };
  const overview = await statsOverview(db, now);
  const data = {
    today: now.toISOString().slice(0, 10),
    accounts: overview.accounts,
    posts: overview.posts.map((p) => ({
      recipe: p.name,
      platform: p.platform,
      publishedAt: p.publishedAt,
      publishedHourParis: p.publishedAt
        ? new Date(p.publishedAt).toLocaleString("fr-FR", {
            timeZone: "Europe/Paris",
            weekday: "long",
            hour: "2-digit",
          })
        : null,
      moment: p.moment,
      cuisine: p.cuisine,
      totalMinutes: p.totalMinutes,
      metrics: p.metrics,
      engagementPer100Views: p.engagementRate,
    })),
  };
  const [generation] = await db
    .insert(s.aiGenerations)
    .values({
      userId: adminId,
      kind: "social_analysis",
      status: "running",
      inputRef: "social:stats",
      promptVersion: INSIGHTS_PROMPT_VERSION,
      startedAt: new Date(),
    })
    .returning({ id: s.aiGenerations.id });
  try {
    const result = await ai.generateStructured({
      promptId: INSIGHTS_PROMPT_VERSION,
      ...buildInsightsPrompt(data),
      schema: insightsSchema,
      maxOutputTokens: 4_000,
    });
    await db
      .update(s.aiGenerations)
      .set({
        status: "succeeded",
        output: result.data,
        finishedAt: new Date(),
        provider: result.usage.provider,
        model: result.usage.model,
        tokensIn: result.usage.inputTokens,
        tokensOut: result.usage.outputTokens,
        costUsdMicros: result.usage.costUsdMicros,
        attempts: result.usage.attempts,
      })
      .where(eq(s.aiGenerations.id, generation!.id));
    await recordAiSpend(db, result.usage.costUsdMicros);
    return { ok: true, analysis: result.data };
  } catch (error) {
    const usage = error instanceof AiGenerationError ? error.usage : undefined;
    await db
      .update(s.aiGenerations)
      .set({
        status: "failed",
        finishedAt: new Date(),
        error: error instanceof Error ? error.message.slice(0, 1000) : String(error),
        costUsdMicros: usage?.costUsdMicros ?? 0,
      })
      .where(eq(s.aiGenerations.id, generation!.id));
    if (usage?.costUsdMicros) await recordAiSpend(db, usage.costUsdMicros);
    return { ok: false, reason: "failed" };
  }
}
