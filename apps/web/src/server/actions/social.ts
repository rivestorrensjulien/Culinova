"use server";

import { createLlmAdapter } from "@culinova/ai";
import { after } from "next/server";
import { getLocale } from "next-intl/server";
import { PUBLICATION_FORMATS } from "@culinova/db/schema";
import { z } from "zod";
import { getDb } from "../db";
import { PLATFORMS, type Platform, type PublicationStatus, publicationStatuses } from "../publishing";
import { requireUser } from "../session";
import { accountToken, disconnectAccount, type SocialPlatform } from "../social/accounts";
import { parseMentions, saveCaptionSettings } from "../social/captions";
import {
  type AdvanceOutcome,
  advanceProcessing,
  type PublicationFormat,
  startPublication,
  type StartResult,
  type TiktokChoices,
} from "../social/publish";
import { analyzeStats, type AnalyzeResult, collectStats } from "../social/stats";
import { type PinterestBoard, pinterestBoards, pinterestCreateBoard } from "../social/pinterest";
import { getPinterestBoard, type PinterestBoardSetting, savePinterestBoard } from "../social/pinterest-board";
import { rejectRecipe, saveAutoplan } from "../social/autoplan";
import { saveCommentReply } from "../social/comment-reply";
import { runAutoplan } from "../social/autoplan-run";
import {
  approveProposal,
  cancelScheduled,
  dismissProposal,
  recipeSchedule,
  type ScheduledView,
  type ScheduleRefusal,
  schedulePublication,
  suggestSlot,
} from "../social/schedule";
import { fromParisInput, toParisInput } from "../social/slots";
import { type CreatorInfo, tiktokCreatorInfo } from "../social/tiktok";
import { REQUESTABLE_FORMATS, type RequestableFormat, requestVideo } from "../social/videos";

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
      const outcomes: AdvanceOutcome[] = await advanceProcessing(db, recipeId).catch(() => []);
      if (!outcomes.includes("processing")) return;
    }
  });
}

const choicesSchema = z.object({
  privacy: z.string().min(1).max(40),
  allowComments: z.boolean(),
  allowDuet: z.boolean(),
  allowStitch: z.boolean(),
  promoteOwnBrand: z.boolean(),
  brandedContent: z.boolean(),
});

export type PublishResult = { result: StartResult; statuses: PublicationStatus[] } | null;

/**
 * « Valider et publier » : la recette part sur le réseau choisi, dans le format choisi
 * (Instagram : photo, carrousel ou Reel ; TikTok : vidéo), avec la légende validée.
 */
export async function publishAction(
  recipeId: string,
  platform: string,
  format: string,
  options: { caption: string; tiktok: TiktokChoices | null },
): Promise<PublishResult> {
  const session = await admin();
  if (!session || !uuid.safeParse(recipeId).success || !isPlatform(platform)) return null;
  if (!(PUBLICATION_FORMATS as readonly string[]).includes(format)) return null;
  const parsed = options.tiktok ? choicesSchema.safeParse(options.tiktok) : null;
  if (platform === "tiktok" && !parsed?.success) return null;
  const caption = z.string().max(2200).safeParse(options.caption);
  if (!caption.success) return null;
  const db = getDb();
  const result = await startPublication(
    db,
    session.user.id,
    recipeId,
    platform,
    format as PublicationFormat,
    {
      caption: caption.data,
      tiktok: parsed?.success ? parsed.data : null,
    },
  );
  if (result.ok) followUp(recipeId);
  return { result, statuses: await publicationStatuses(db, recipeId) };
}

/** Comptes mentionnés et mention « visuel généré par IA » ajoutés aux légendes. */
export async function saveCaptionSettingsAction(input: {
  mentions: string;
  aiNotice: boolean;
}): Promise<boolean> {
  const session = await admin();
  if (!session) return false;
  await saveCaptionSettings(getDb(), session.user.id, {
    mentions: parseMentions(String(input.mentions ?? "")),
    aiNotice: Boolean(input.aiNotice),
  });
  return true;
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

/** Tableaux du compte Pinterest relié, et celui choisi pour les épingles. */
export async function pinterestBoardsAction(): Promise<{
  boards: PinterestBoard[];
  selected: PinterestBoardSetting | null;
} | null> {
  if (!(await admin())) return null;
  const db = getDb();
  const account = await accountToken(db, "pinterest").catch(() => null);
  if (!account) return null;
  const boards = await pinterestBoards(account.accessToken).catch(() => null);
  if (!boards) return null;
  return { boards, selected: await getPinterestBoard(db) };
}

export async function savePinterestBoardAction(boardId: string, boardName: string): Promise<boolean> {
  const session = await admin();
  if (!session || !/^\d{1,30}$/.test(boardId)) return false;
  await savePinterestBoard(getDb(), session.user.id, { boardId, boardName: String(boardName ?? "") });
  return true;
}

/** Crée le tableau « Recettes Culinova » et le choisit pour les épingles. */
export async function createPinterestBoardAction(): Promise<PinterestBoard | null> {
  const session = await admin();
  if (!session) return null;
  const db = getDb();
  const account = await accountToken(db, "pinterest").catch(() => null);
  if (!account) return null;
  const board = await pinterestCreateBoard(
    account.accessToken,
    "Recettes Culinova",
    "Recettes pesées et chiffrées, créées avec Culinova (culinova.fr).",
  ).catch(() => null);
  if (!board) return null;
  await savePinterestBoard(db, session.user.id, { boardId: board.id, boardName: board.name });
  return board;
}

const scheduleSchema = z.object({
  recipeId: z.uuid(),
  platform: z.enum(PLATFORMS),
  format: z.enum(PUBLICATION_FORMATS),
  /** Heure de Paris « AAAA-MM-JJTHH:MM ». */
  at: z.string().max(20),
  caption: z.string().max(2200),
  tiktok: choicesSchema.nullable(),
});

export type ScheduleActionResult =
  { ok: true; schedule: ScheduledView[] } | { ok: false; reason: ScheduleRefusal | "invalid" };

/** « Programmer » : la publication validée partira automatiquement à l'heure choisie. */
export async function schedulePublicationAction(
  input: z.input<typeof scheduleSchema>,
): Promise<ScheduleActionResult> {
  const session = await admin();
  const parsed = scheduleSchema.safeParse(input);
  if (!session || !parsed.success) return { ok: false, reason: "invalid" };
  const at = fromParisInput(parsed.data.at);
  if (!at) return { ok: false, reason: "invalid_date" };
  const db = getDb();
  const result = await schedulePublication(db, session.user.id, {
    recipeId: parsed.data.recipeId,
    platform: parsed.data.platform,
    format: parsed.data.format,
    at,
    caption: parsed.data.caption,
    tiktok: parsed.data.tiktok,
  });
  if (!result.ok) return result;
  return { ok: true, schedule: await recipeSchedule(db, parsed.data.recipeId) };
}

/** Annule une programmation ; renvoie les programmations restantes de la recette. */
export async function cancelScheduleAction(
  recipeId: string,
  scheduleId: string,
): Promise<ScheduledView[] | null> {
  const session = await admin();
  if (!session || !uuid.safeParse(recipeId).success || !uuid.safeParse(scheduleId).success) return null;
  const db = getDb();
  await cancelScheduled(db, session.user.id, scheduleId);
  return recipeSchedule(db, recipeId);
}

/** Prochain créneau conseillé encore libre (heure de Paris, pour le champ « date et heure »). */
export async function suggestSlotAction(platform: string): Promise<string | null> {
  const session = await admin();
  if (!session || !isPlatform(platform)) return null;
  const slot = await suggestSlot(getDb(), platform);
  return slot ? toParisInput(slot) : null;
}

const approveSchema = z.object({
  recipeId: z.uuid(),
  proposalId: z.uuid(),
  at: z.string().max(20),
  caption: z.string().max(2200),
  tiktok: choicesSchema.nullable(),
});

/** Validation d'une publication proposée par la planification automatique. */
export async function approveProposalAction(
  input: z.input<typeof approveSchema>,
): Promise<ScheduleActionResult> {
  const session = await admin();
  const parsed = approveSchema.safeParse(input);
  if (!session || !parsed.success) return { ok: false, reason: "invalid" };
  const at = fromParisInput(parsed.data.at);
  if (!at) return { ok: false, reason: "invalid_date" };
  const db = getDb();
  const result = await approveProposal(db, session.user.id, parsed.data.proposalId, {
    at,
    caption: parsed.data.caption,
    tiktok: parsed.data.tiktok,
  });
  if (!result.ok) return result;
  return { ok: true, schedule: await recipeSchedule(db, parsed.data.recipeId) };
}

/** Écarte une seule publication proposée. */
export async function dismissProposalAction(
  recipeId: string,
  proposalId: string,
): Promise<ScheduledView[] | null> {
  const session = await admin();
  if (!session || !uuid.safeParse(recipeId).success || !uuid.safeParse(proposalId).success) return null;
  const db = getDb();
  await dismissProposal(db, session.user.id, proposalId);
  return recipeSchedule(db, recipeId);
}

/** Écarte la recette proposée : une autre est choisie aussitôt pour ce jour-là. */
export async function rejectRecipeAction(recipeId: string): Promise<ScheduledView[] | null> {
  const session = await admin();
  if (!session || !uuid.safeParse(recipeId).success) return null;
  const db = getDb();
  if (await rejectRecipe(db, session.user.id, recipeId)) {
    after(() => runAutoplan(getDb()).then(() => undefined));
  }
  return recipeSchedule(db, recipeId);
}

/** Active ou suspend la planification automatique. */
export async function saveAutoplanAction(enabled: boolean): Promise<boolean> {
  const session = await admin();
  if (!session) return false;
  const db = getDb();
  await saveAutoplan(db, session.user.id, { enabled: Boolean(enabled) });
  if (enabled) after(() => runAutoplan(getDb()).then(() => undefined));
  return true;
}

/** « Refaire la vidéo » dans un format (vide = automatique) : l'agent la refait dans la demi-heure. */
export async function requestVideoAction(recipeId: string, format: string): Promise<boolean> {
  const session = await admin();
  if (!session || !uuid.safeParse(recipeId).success) return false;
  const chosen = (REQUESTABLE_FORMATS as readonly string[]).includes(format)
    ? (format as RequestableFormat)
    : null;
  return requestVideo(getDb(), session.user.id, recipeId, chosen);
}

/** « Commente RECETTE » : activé ou non, et mot-clé. */
export async function saveCommentReplyAction(input: { enabled: boolean; keyword: string }): Promise<boolean> {
  const session = await admin();
  const parsed = z.object({ enabled: z.boolean(), keyword: z.string().max(40) }).safeParse(input);
  if (!session || !parsed.success) return false;
  await saveCommentReply(getDb(), session.user.id, parsed.data);
  return true;
}
