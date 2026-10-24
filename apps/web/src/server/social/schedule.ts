/**
 * Programmation des publications (demande de Julien du 24/10) : l'administrateur valide une
 * publication (réseau, format, légende, choix TikTok) pour une date et une heure ; elle est lancée
 * automatiquement par `runDueSchedules`, appelée toutes les 10 minutes (GitHub Actions
 * « Programmation des publications »), par le suivi de l'agent et par la tâche quotidienne.
 */
import type { Database } from "@culinova/db";
import * as s from "@culinova/db/schema";
import { and, asc, eq, gte, inArray, lte, or } from "drizzle-orm";
import { audit } from "../audit";
import { adminRecipe } from "../publishing";
import type { SocialPlatform } from "./accounts";
import { latestCarousel } from "./carousels";
import {
  FORMATS_BY_PLATFORM,
  type PublicationFormat,
  type PublishDeps,
  startPublication,
  type TiktokChoices,
} from "./publish";
import { nextSlots } from "./slots";
import { currentPhoto, latestVideo } from "./videos";

/** Au plus deux mois à l'avance. */
const MAX_AHEAD_MS = 60 * 24 * 3600 * 1000;
/** Au-delà de 6 h de retard (service arrêté), le créneau est manqué : on ne publie pas en pleine nuit. */
const MAX_LATE_MS = 6 * 3600 * 1000;

export interface ScheduledView {
  id: string;
  platform: SocialPlatform;
  format: PublicationFormat;
  scheduledAt: string;
  status: s.ScheduledPublicationStatus;
  note: string | null;
}

export type ScheduleRefusal =
  "not_found" | "invalid_format" | "invalid_date" | "invalid_privacy" | "not_ready" | "outdated";
export type ScheduleResult = { ok: true; id: string } | { ok: false; reason: ScheduleRefusal };

async function ownedAdminRecipe(db: Database, adminId: string, recipeId: string) {
  const recipe = await adminRecipe(db, recipeId);
  const [owner] = await db
    .select({ ownerId: s.recipes.ownerId })
    .from(s.recipes)
    .where(eq(s.recipes.id, recipeId));
  return recipe?.versionId && owner?.ownerId === adminId ? recipe : null;
}

/** Ce qui sera publié existe-t-il déjà et correspond-il à la version actuelle ? */
async function mediaReady(
  db: Database,
  recipeId: string,
  versionId: string,
  format: PublicationFormat,
): Promise<"ok" | "not_ready" | "outdated"> {
  if (format === "video") {
    const video = await latestVideo(db, recipeId);
    return !video ? "not_ready" : video.current ? "ok" : "outdated";
  }
  if (format === "carousel") {
    const carousel = await latestCarousel(db, recipeId);
    return !carousel ? "not_ready" : carousel.current ? "ok" : "outdated";
  }
  return (await currentPhoto(db, versionId, "4:5")) ? "ok" : "not_ready";
}

interface ScheduleInput {
  recipeId: string;
  platform: SocialPlatform;
  format: PublicationFormat;
  at: Date;
  caption?: string | null;
  tiktok?: TiktokChoices | null;
}

/** Vérifie qu'une publication peut être programmée (date, choix TikTok, recette, visuel prêt). */
async function checkSchedule(
  db: Database,
  adminId: string,
  input: ScheduleInput,
  now: Date,
): Promise<ScheduleRefusal | null> {
  const { recipeId, platform, format, at } = input;
  if (!FORMATS_BY_PLATFORM[platform].includes(format)) return "invalid_format";
  if (
    Number.isNaN(at.getTime()) ||
    at.getTime() < now.getTime() + 60_000 ||
    at.getTime() > now.getTime() + MAX_AHEAD_MS
  )
    return "invalid_date";
  if (platform === "tiktok") {
    const choices = input.tiktok;
    if (!choices?.privacy) return "invalid_privacy";
    if (choices.brandedContent && choices.privacy === "SELF_ONLY") return "invalid_privacy";
  }
  const recipe = await ownedAdminRecipe(db, adminId, recipeId);
  if (!recipe?.versionId) return "not_found";
  const ready = await mediaReady(db, recipeId, recipe.versionId, format);
  return ready === "ok" ? null : ready;
}

/** Programme une publication validée par l'administrateur. */
export async function schedulePublication(
  db: Database,
  adminId: string,
  input: ScheduleInput,
  now: Date = new Date(),
): Promise<ScheduleResult> {
  const refusal = await checkSchedule(db, adminId, input, now);
  if (refusal) return { ok: false, reason: refusal };
  const { recipeId, platform, format, at } = input;
  const caption = input.caption?.trim() || null;
  const [row] = await db
    .insert(s.scheduledPublications)
    .values({
      recipeId,
      platform,
      format,
      scheduledAt: at,
      caption,
      tiktok: platform === "tiktok" ? (input.tiktok ?? null) : null,
      createdBy: adminId,
    })
    .returning({ id: s.scheduledPublications.id });
  await audit(db, {
    actorId: adminId,
    action: "publication.schedule",
    entity: "recipe",
    entityId: recipeId,
    after: { platform, format, at: at.toISOString() },
  });
  return { ok: true, id: row!.id };
}

/** Annule une publication programmée (encore en attente). */
export async function cancelScheduled(db: Database, adminId: string, scheduleId: string): Promise<boolean> {
  const [row] = await db
    .update(s.scheduledPublications)
    .set({ status: "cancelled", updatedAt: new Date() })
    .where(
      and(
        eq(s.scheduledPublications.id, scheduleId),
        eq(s.scheduledPublications.createdBy, adminId),
        eq(s.scheduledPublications.status, "scheduled"),
      ),
    )
    .returning({ recipeId: s.scheduledPublications.recipeId });
  if (!row) return false;
  await audit(db, {
    actorId: adminId,
    action: "publication.schedule.cancel",
    entity: "recipe",
    entityId: row.recipeId,
    after: { scheduleId },
  });
  return true;
}

/**
 * Validation d'une publication proposée par la planification automatique : elle devient une
 * publication programmée (heure éventuellement changée, légende et choix TikTok validés).
 */
export async function approveProposal(
  db: Database,
  adminId: string,
  proposalId: string,
  input: { at: Date; caption?: string | null; tiktok?: TiktokChoices | null },
  now: Date = new Date(),
): Promise<ScheduleResult> {
  const [row] = await db
    .select()
    .from(s.scheduledPublications)
    .where(
      and(
        eq(s.scheduledPublications.id, proposalId),
        eq(s.scheduledPublications.createdBy, adminId),
        eq(s.scheduledPublications.status, "proposed"),
      ),
    );
  if (!row) return { ok: false, reason: "not_found" };
  const refusal = await checkSchedule(
    db,
    adminId,
    { recipeId: row.recipeId, platform: row.platform, format: row.format, ...input },
    now,
  );
  if (refusal) return { ok: false, reason: refusal };
  const [updated] = await db
    .update(s.scheduledPublications)
    .set({
      status: "scheduled",
      scheduledAt: input.at,
      caption: input.caption?.trim() || null,
      tiktok: row.platform === "tiktok" ? (input.tiktok ?? null) : null,
      updatedAt: now,
    })
    .where(and(eq(s.scheduledPublications.id, row.id), eq(s.scheduledPublications.status, "proposed")))
    .returning({ id: s.scheduledPublications.id });
  if (!updated) return { ok: false, reason: "not_found" };
  await audit(db, {
    actorId: adminId,
    action: "publication.proposal.approve",
    entity: "recipe",
    entityId: row.recipeId,
    after: { platform: row.platform, format: row.format, at: input.at.toISOString() },
  });
  return { ok: true, id: row.id };
}

/** Écarte une seule publication proposée (les autres réseaux de la recette restent proposés). */
export async function dismissProposal(db: Database, adminId: string, proposalId: string): Promise<boolean> {
  const [row] = await db
    .update(s.scheduledPublications)
    .set({ status: "cancelled", note: "Écartée par l'administrateur.", updatedAt: new Date() })
    .where(
      and(
        eq(s.scheduledPublications.id, proposalId),
        eq(s.scheduledPublications.createdBy, adminId),
        eq(s.scheduledPublications.status, "proposed"),
      ),
    )
    .returning({ recipeId: s.scheduledPublications.recipeId });
  if (!row) return false;
  await audit(db, {
    actorId: adminId,
    action: "publication.proposal.dismiss",
    entity: "recipe",
    entityId: row.recipeId,
    after: { proposalId },
  });
  return true;
}

const toView = (row: typeof s.scheduledPublications.$inferSelect): ScheduledView => ({
  id: row.id,
  platform: row.platform,
  format: row.format,
  scheduledAt: row.scheduledAt.toISOString(),
  status: row.status,
  note: row.note,
});

/** Programmations d'une recette : propositions, celles à venir et les échecs des 7 derniers jours. */
export async function recipeSchedule(
  db: Database,
  recipeId: string,
  now: Date = new Date(),
): Promise<ScheduledView[]> {
  const rows = await db
    .select()
    .from(s.scheduledPublications)
    .where(
      and(
        eq(s.scheduledPublications.recipeId, recipeId),
        or(
          inArray(s.scheduledPublications.status, ["proposed", "scheduled"]),
          and(
            inArray(s.scheduledPublications.status, ["failed", "expired"]),
            gte(s.scheduledPublications.updatedAt, new Date(now.getTime() - 7 * 24 * 3600 * 1000)),
          ),
        ),
      ),
    )
    .orderBy(asc(s.scheduledPublications.scheduledAt));
  return rows.map(toView);
}

export interface CalendarEntry extends ScheduledView {
  recipeId: string;
  recipeName: string;
}

/** Calendrier de l'administration : propositions et programmations à venir, toutes recettes confondues. */
export async function upcomingSchedule(db: Database, limit = 50): Promise<CalendarEntry[]> {
  const rows = await db
    .select({ row: s.scheduledPublications, name: s.recipeVersions.name })
    .from(s.scheduledPublications)
    .innerJoin(s.recipes, eq(s.recipes.id, s.scheduledPublications.recipeId))
    .leftJoin(s.recipeVersions, eq(s.recipeVersions.id, s.recipes.currentVersionId))
    .where(inArray(s.scheduledPublications.status, ["proposed", "scheduled"]))
    .orderBy(asc(s.scheduledPublications.scheduledAt))
    .limit(limit);
  return rows.map(({ row, name }) => ({
    ...toView(row),
    recipeId: row.recipeId,
    recipeName: name ?? "Recette",
  }));
}

/** Prochain créneau conseillé encore libre pour un réseau. */
export async function suggestSlot(
  db: Database,
  platform: SocialPlatform,
  now: Date = new Date(),
): Promise<Date | null> {
  const taken = await db
    .select({ at: s.scheduledPublications.scheduledAt })
    .from(s.scheduledPublications)
    .where(
      and(
        eq(s.scheduledPublications.platform, platform),
        inArray(s.scheduledPublications.status, ["proposed", "scheduled"]),
        gte(s.scheduledPublications.scheduledAt, now),
      ),
    );
  return (
    nextSlots(
      platform,
      now,
      taken.map((t) => t.at),
    )[0] ?? null
  );
}

export type DueOutcome = "started" | "failed" | "missed" | "expired";

/** Lance les publications programmées arrivées à échéance. Chacune n'est lancée qu'une fois. */
export async function runDueSchedules(db: Database, deps: PublishDeps = {}): Promise<DueOutcome[]> {
  const now = deps.now ?? new Date();
  // Propositions non validées à l'heure prévue : rien n'est publié.
  const expired = await db
    .update(s.scheduledPublications)
    .set({ status: "expired", note: "Non validée à temps : rien n'a été publié.", updatedAt: now })
    .where(and(eq(s.scheduledPublications.status, "proposed"), lte(s.scheduledPublications.scheduledAt, now)))
    .returning({ id: s.scheduledPublications.id });
  const outcomes: DueOutcome[] = expired.map(() => "expired" as const);
  const due = await db
    .select({ id: s.scheduledPublications.id })
    .from(s.scheduledPublications)
    .where(
      and(eq(s.scheduledPublications.status, "scheduled"), lte(s.scheduledPublications.scheduledAt, now)),
    )
    .orderBy(asc(s.scheduledPublications.scheduledAt));
  for (const { id } of due) {
    // Réservation : une seule exécution peut passer « scheduled » → « started ».
    const [row] = await db
      .update(s.scheduledPublications)
      .set({ status: "started", startedAt: now, updatedAt: now })
      .where(and(eq(s.scheduledPublications.id, id), eq(s.scheduledPublications.status, "scheduled")))
      .returning();
    if (!row) continue;
    const fail = async (note: string, outcome: DueOutcome) => {
      await db
        .update(s.scheduledPublications)
        .set({ status: "failed", note: note.slice(0, 500), updatedAt: now })
        .where(eq(s.scheduledPublications.id, row.id));
      await audit(db, {
        actorId: null,
        action: "publication.schedule.failed",
        entity: "recipe",
        entityId: row.recipeId,
        after: { platform: row.platform, format: row.format, note },
      });
      outcomes.push(outcome);
    };
    if (now.getTime() - row.scheduledAt.getTime() > MAX_LATE_MS) {
      await fail("Créneau manqué (plus de 6 h de retard) : reprogrammez la publication.", "missed");
      continue;
    }
    const result = await startPublication(
      db,
      row.createdBy,
      row.recipeId,
      row.platform,
      row.format,
      { caption: row.caption, tiktok: row.tiktok },
      deps,
    ).catch((error: unknown) => ({
      ok: false as const,
      reason: "failed" as const,
      detail: error instanceof Error ? error.message : String(error),
    }));
    if (result.ok) outcomes.push("started");
    else await fail(failureNote(result.reason, result.detail), "failed");
  }
  return outcomes;
}

const REASONS: Record<string, string> = {
  not_found: "Recette introuvable.",
  no_video: "Pas de vidéo pour cette recette.",
  no_photo: "Pas de photo 4:5 pour cette recette.",
  no_carousel: "Pas de carrousel pour cette recette.",
  outdated:
    "La recette ou sa photo a changé depuis la programmation : vérifiez le nouveau visuel puis reprogrammez.",
  not_connected: "Compte non relié ou jeton expiré : reliez le compte dans l'administration.",
  no_board: "Aucun tableau Pinterest choisi.",
  invalid_privacy: "Confidentialité TikTok refusée par TikTok.",
  too_long: "Vidéo trop longue pour ce compte TikTok.",
  invalid_format: "Format non pris en charge.",
  failed: "Le réseau a refusé la publication.",
};

function failureNote(reason: string, detail?: string): string {
  return detail ? `${REASONS[reason] ?? reason} ${detail}` : (REASONS[reason] ?? reason);
}
