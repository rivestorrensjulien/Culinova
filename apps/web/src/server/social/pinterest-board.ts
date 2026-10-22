/** Tableau Pinterest où l'agent épingle les recettes (réglage de l'administration › Réseaux). */
import type { Database } from "@culinova/db";
import * as s from "@culinova/db/schema";
import { eq } from "drizzle-orm";
import { audit } from "../audit";

export interface PinterestBoardSetting {
  boardId: string;
  boardName: string;
}

export async function getPinterestBoard(db: Database): Promise<PinterestBoardSetting | null> {
  const [row] = await db
    .select({ value: s.siteSettings.value })
    .from(s.siteSettings)
    .where(eq(s.siteSettings.key, s.SETTING_KEYS.socialPinterest));
  const value = (row?.value ?? {}) as Partial<PinterestBoardSetting>;
  return value.boardId && /^\d+$/.test(value.boardId)
    ? { boardId: value.boardId, boardName: value.boardName ?? "" }
    : null;
}

export async function savePinterestBoard(db: Database, adminId: string, board: PinterestBoardSetting) {
  const value = { boardId: board.boardId, boardName: board.boardName.slice(0, 200) };
  await db
    .insert(s.siteSettings)
    .values({ key: s.SETTING_KEYS.socialPinterest, value })
    .onConflictDoUpdate({ target: s.siteSettings.key, set: { value, updatedAt: new Date() } });
  await audit(db, {
    actorId: adminId,
    action: "social.pinterest_board",
    entity: "site_setting",
    after: value,
  });
}
