/**
 * Tâche quotidienne (Vercel Cron, voir vercel.json) : efface ce qui a dépassé sa durée
 * de conservation. Protégée par CRON_SECRET, que Vercel envoie automatiquement.
 */
import { timingSafeEqual } from "node:crypto";
import { getDb } from "@/server/db";
import { purgeExpiredData } from "@/server/purge";

export const dynamic = "force-dynamic";

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
  return Response.json(await purgeExpiredData(getDb()));
}
