/** Brouillons du wizard : un brouillon ouvert par personne, sauvegarde « dernier écrit gagnant ». */
import type { Database } from "@culinova/db";
import * as s from "@culinova/db/schema";
import { and, desc, eq, inArray, isNull, lt, or } from "drizzle-orm";
import { emptyWizardState, parseWizardState, type WizardState } from "@/lib/wizard";

export type DraftRow = typeof s.recipeDrafts.$inferSelect;

const OPEN: s.DraftStatus[] = ["editing", "generating", "failed", "done"];

export async function getOrCreateDraft(
  db: Database,
  userId: string,
  language: "fr" | "en",
): Promise<DraftRow> {
  const [open] = await db
    .select()
    .from(s.recipeDrafts)
    .where(and(eq(s.recipeDrafts.userId, userId), inArray(s.recipeDrafts.status, OPEN)))
    .orderBy(desc(s.recipeDrafts.updatedAt))
    .limit(1);
  if (open) return open;
  const [created] = await db
    .insert(s.recipeDrafts)
    .values({ userId, state: emptyWizardState(language), wizardStep: 1 })
    .returning();
  return created!;
}

/** Ferme le brouillon en cours (la recette générée reste dans « Mes recettes ») et en ouvre un neuf. */
export async function startNewDraft(db: Database, userId: string, language: "fr" | "en"): Promise<DraftRow> {
  await db
    .update(s.recipeDrafts)
    .set({ status: "archived" })
    .where(
      and(eq(s.recipeDrafts.userId, userId), inArray(s.recipeDrafts.status, ["editing", "failed", "done"])),
    );
  return getOrCreateDraft(db, userId, language);
}

export type SaveResult =
  | { ok: true; savedAt: string }
  | { ok: false; reason: "not_found" }
  | { ok: false; reason: "stale"; state: WizardState; clientUpdatedAt: string | null };

/**
 * Enregistre l'état du wizard. Une sauvegarde plus ancienne que celle déjà en
 * base (autre onglet, autre appareil, envoi hors ligne tardif) est refusée et
 * la version la plus récente est renvoyée.
 */
export async function saveDraft(
  db: Database,
  input: { userId: string; draftId: string; state: unknown; clientUpdatedAt: Date },
): Promise<SaveResult> {
  const state = parseWizardState(input.state);
  const updated = await db
    .update(s.recipeDrafts)
    .set({ state, wizardStep: state.step, clientUpdatedAt: input.clientUpdatedAt })
    .where(
      and(
        eq(s.recipeDrafts.id, input.draftId),
        eq(s.recipeDrafts.userId, input.userId),
        inArray(s.recipeDrafts.status, OPEN),
        or(isNull(s.recipeDrafts.clientUpdatedAt), lt(s.recipeDrafts.clientUpdatedAt, input.clientUpdatedAt)),
      ),
    )
    .returning({ updatedAt: s.recipeDrafts.updatedAt });
  if (updated[0]) return { ok: true, savedAt: updated[0].updatedAt.toISOString() };

  const [current] = await db
    .select()
    .from(s.recipeDrafts)
    .where(and(eq(s.recipeDrafts.id, input.draftId), eq(s.recipeDrafts.userId, input.userId)));
  if (!current || current.status === "archived") return { ok: false, reason: "not_found" };
  return {
    ok: false,
    reason: "stale",
    state: parseWizardState(current.state),
    clientUpdatedAt: current.clientUpdatedAt?.toISOString() ?? null,
  };
}
