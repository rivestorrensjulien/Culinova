/**
 * Tâche quotidienne (Vercel Cron, voir vercel.json) : publications en cours avancées,
 * jetons renouvelés et statistiques des réseaux relevées. Protégée par CRON_SECRET.
 */
import { timingSafeEqual } from "node:crypto";
import { getDb } from "@/server/db";
import { advanceProcessing } from "@/server/social/publish";
import { runDueSchedules } from "@/server/social/schedule";
import { collectStats } from "@/server/social/stats";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

function authorized(header: string | null): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret || !header) return false;
  const expected = Buffer.from(`Bearer ${secret}`);
  const given = Buffer.from(header);
  return expected.length === given.length && timingSafeEqual(expected, given);
}

export async function GET(request: Request) {
  if (!authorized(request.headers.get("authorization"))) {
    return new Response("Non autorisé", { status: 401 });
  }
  const db = getDb();
  const scheduled = await runDueSchedules(db);
  const publications = await advanceProcessing(db);
  const stats = await collectStats(db);
  return Response.json({ scheduled, publications, stats });
}
