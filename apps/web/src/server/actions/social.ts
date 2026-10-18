"use server";

import { createLlmAdapter } from "@culinova/ai";
import { after } from "next/server";
import { getLocale } from "next-intl/server";
import { z } from "zod";
import { getDb } from "../db";
import { PLATFORMS, type Platform, type PublicationStatus, publicationStatuses } from "../publishing";
import { requireUser } from "../session";
import { accountToken, disconnectAccount, type SocialPlatform } from "../social/accounts";
import { advanceProcessing, startPublication, type StartResult, type TiktokChoices } from "../social/publish";
import { analyzeStats, type AnalyzeResult, collectStats } from "../social/stats";
import { type CreatorInfo, tiktokCreatorInfo } from "../social/tiktok";

const uuid = z.uuid();

async function admin() {
  const session = await requireUser(await getLocale());
  return session.user.role === "admin" && !session.impersonatedBy && session.twoFactorVerifiedAt
    ? session
    : null;
}

function isPlatform(value: string): value is Platform {
  return (PLATFORMS as readonly string[]).includes(value);
}

/** Suivi en arrière-plan pendant 4 minutes au plus (puis le suivi régulier prend le relais). */
function followUp(recipeId: string) {
  after(async () => {
    const db = getDb();
    for (let i = 0; i < 24; i++) {
      await new Promise((resolve) => setTimeout(resolve, 10_000));
      const outcomes = await advanceProcessing(db, recipeId).catch(() => []);
      if (!outcomes.includes("processing")) return;
    }
  });
}

const choicesSchema = z.object({
  privacy: z.string().min(1).max(40),
  allowComments: z.boolean(),
  allowDuet: z.boolean(),
  allowStitch: z.boolean(),
});

export type PublishVideoResult = { result: StartResult; statuses: PublicationStatus[] } | null;

/** « Valider et publier » : la dernière vidéo de la recette part sur le réseau choisi. */
export async function publishVideoAction(
  recipeId: string,
  platform: string,
  choices: TiktokChoices | null,
): Promise<PublishVideoResult> {
  const session = await admin();
  if (!session || !uuid.safeParse(recipeId).success || !isPlatform(platform)) return null;
  const parsed = choices ? choicesSchema.safeParse(choices) : null;
  if (platform === "tiktok" && !parsed?.success) return null;
  const db = getDb();
  const result = await startPublication(
    db,
    session.user.id,
    recipeId,
    platform,
    parsed?.success ? parsed.data : null,
  );
  if (result.ok) followUp(recipeId);
  return { result, statuses: await publicationStatuses(db, recipeId) };
}

/** Rafraîchit l'état des publications en cours d'une recette (appelé par l'encart). */
export async function refreshPublicationsAction(recipeId: string): Promise<PublicationStatus[] | null> {
  const session = await admin();
  if (!session || !uuid.safeParse(recipeId).success) return null;
  const db = getDb();
  await advanceProcessing(db, recipeId).catch(() => []);
  return publicationStatuses(db, recipeId);
}

/** Informations du compte TikTok à montrer avant de publier (pseudo, confidentialités possibles). */
export async function tiktokCreatorInfoAction(): Promise<CreatorInfo | null> {
  if (!(await admin())) return null;
  const account = await accountToken(getDb(), "tiktok").catch(() => null);
  if (!account) return null;
  return tiktokCreatorInfo(account.accessToken).catch(() => null);
}

export async function disconnectAccountAction(platform: string): Promise<boolean> {
  const session = await admin();
  if (!session || !isPlatform(platform)) return false;
  await disconnectAccount(getDb(), session.user.id, platform as SocialPlatform);
  return true;
}

export async function collectStatsAction(): Promise<boolean> {
  if (!(await admin())) return false;
  await collectStats(getDb());
  return true;
}

export async function analyzeStatsAction(): Promise<AnalyzeResult | null> {
  const session = await admin();
  if (!session) return null;
  return analyzeStats(getDb(), createLlmAdapter(process.env, { effort: "medium" }), session.user.id);
}
