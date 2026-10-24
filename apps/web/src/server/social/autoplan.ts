/**
 * Planification automatique, semi-automatique (décision de Julien du 24/10) : l'agent remplit les
 * 7 prochains jours de publication (mardi, jeudi, dimanche) avec des recettes de l'administrateur
 * jamais publiées, tirées au hasard en variant les moments du repas ; il génère la photo si elle
 * manque, demande la vidéo et le carrousel, puis propose les publications (Reel Instagram, vidéo
 * TikTok, épingle Pinterest) aux créneaux conseillés. Rien ne part sans validation : une
 * proposition non validée à l'heure prévue expire. Les administrateurs sont prévenus par e-mail.
 */
import type { Database } from "@culinova/db";
import * as s from "@culinova/db/schema";
import { and, eq, gte, inArray, isNotNull, isNull, lte } from "drizzle-orm";
import { audit } from "../audit";
import { cancelPublication, queuePublication } from "../publishing";
import type { SocialPlatform } from "./accounts";
import { latestCarousel } from "./carousels";
import type { PublicationFormat } from "./publish";
import { nextSlots, sameParisDay, slotOnDay } from "./slots";
import { currentPhoto, latestVideo } from "./videos";

export interface AutoplanSettings {
  enabled: boolean;
}

/** Activée par défaut : chaque publication reste à valider. */
export const DEFAULT_AUTOPLAN: AutoplanSettings = { enabled: true };

/** Jours planifiés à l'avance. */
const HORIZON_MS = 7 * 24 * 3600 * 1000;
/** Délai minimal avant un créneau planifié : photo, vidéo et validation ont le temps de se faire. */
const MIN_LEAD_MS = 12 * 3600 * 1000;
/** Une recette écartée n'est plus proposée dans les 60 jours qui suivent le jour prévu ; une recette publiée n'est reprise qu'après 60 jours. */
const COOLDOWN_MS = 60 * 24 * 3600 * 1000;

/** Ce qui est proposé pour chaque recette du jour. */
const PLAN: ReadonlyArray<{ platform: SocialPlatform; format: PublicationFormat }> = [
  { platform: "instagram", format: "video" },
  { platform: "tiktok", format: "video" },
  { platform: "pinterest", format: "photo" },
];

/** Statuts qui « occupent » une journée (une recette écartée libère la sienne). */
const OCCUPYING: s.ScheduledPublicationStatus[] = ["proposed", "scheduled", "started", "expired", "failed"];

export async function getAutoplan(db: Database): Promise<AutoplanSettings> {
  const [row] = await db
    .select({ value: s.siteSettings.value })
    .from(s.siteSettings)
    .where(eq(s.siteSettings.key, s.SETTING_KEYS.socialAutoplan));
  const value = (row?.value ?? {}) as Partial<AutoplanSettings>;
  return { enabled: value.enabled ?? DEFAULT_AUTOPLAN.enabled };
}

export async function saveAutoplan(db: Database, adminId: string, settings: AutoplanSettings) {
  const value = { enabled: settings.enabled };
  await db
    .insert(s.siteSettings)
    .values({ key: s.SETTING_KEYS.socialAutoplan, value })
    .onConflictDoUpdate({ target: s.siteSettings.key, set: { value, updatedAt: new Date() } });
  await audit(db, { actorId: adminId, action: "social.autoplan", entity: "site_setting", after: value });
}

export interface PlannedDay {
  day: string;
  recipeId: string;
  recipeName: string;
  /** La photo manquait : sa génération a été lancée. */
  photoStarted: boolean;
}

export interface AutoplanDeps {
  now?: Date;
  /** Tirage au hasard (remplaçable dans les tests). */
  random?: () => number;
  /** Lance la photo d'une recette ; false si c'est impossible (quota, budget…). */
  startPhoto?: (db: Database, ownerId: string, recipeId: string) => Promise<boolean>;
  /** Prévient les administrateurs des nouvelles propositions. */
  notify?: (db: Database, planned: PlannedDay[]) => Promise<void>;
  /** Limite aux recettes d'un administrateur (tests). */
  onlyOwner?: string;
}

interface Candidate {
  id: string;
  ownerId: string;
  versionId: string;
  name: string;
  momentId: string | null;
  hasPhoto: boolean;
}

function shuffle<T>(items: T[], random: () => number): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

/** Recettes publiables des administrateurs, avec leur dernière publication. */
async function candidates(db: Database, now: Date, onlyOwner?: string) {
  const recipes = await db
    .select({
      id: s.recipes.id,
      ownerId: s.recipes.ownerId,
      versionId: s.recipes.currentVersionId,
      name: s.recipeVersions.name,
      momentId: s.recipeVersions.momentId,
    })
    .from(s.recipes)
    .innerJoin(s.users, eq(s.users.id, s.recipes.ownerId))
    .innerJoin(s.recipeVersions, eq(s.recipeVersions.id, s.recipes.currentVersionId))
    .where(
      and(
        eq(s.users.role, "admin"),
        isNull(s.users.suspendedAt),
        eq(s.recipes.kind, "dish"),
        isNull(s.recipes.deletedAt),
        isNotNull(s.recipes.currentVersionId),
        onlyOwner ? eq(s.recipes.ownerId, onlyOwner) : undefined,
      ),
    );
  const ids = recipes.map((r) => r.id);
  if (ids.length === 0) return { recipes: [], lastPublished: new Map<string, Date>(), excluded: new Set() };
  const published = await db
    .select({ recipeId: s.recipePublications.recipeId, at: s.recipePublications.publishedAt })
    .from(s.recipePublications)
    .where(and(inArray(s.recipePublications.recipeId, ids), eq(s.recipePublications.status, "published")));
  const plans = await db
    .select({
      recipeId: s.scheduledPublications.recipeId,
      status: s.scheduledPublications.status,
      at: s.scheduledPublications.scheduledAt,
    })
    .from(s.scheduledPublications)
    .where(inArray(s.scheduledPublications.recipeId, ids));
  const lastPublished = new Map<string, Date>();
  const mark = (id: string, at: Date) => {
    const before = lastPublished.get(id);
    if (!before || before < at) lastPublished.set(id, at);
  };
  for (const row of published) mark(row.recipeId, row.at ?? now);
  for (const row of plans) if (row.status === "started") mark(row.recipeId, row.at);
  const excluded = new Set<string>();
  for (const row of plans) {
    // Déjà proposée ou programmée, ou écartée récemment par l'administrateur.
    if (row.status === "proposed" || row.status === "scheduled") excluded.add(row.recipeId);
    if (row.status === "rejected" && row.at.getTime() > now.getTime() - COOLDOWN_MS)
      excluded.add(row.recipeId);
  }
  return { recipes, lastPublished, excluded };
}

/**
 * Choix de la recette d'un jour : d'abord celles jamais publiées (au hasard, celles qui ont déjà
 * leur photo en premier, en évitant le moment du repas de la veille) ; quand il n'y en a plus,
 * les plus anciennement publiées (plus de 60 jours) dont la vidéo est toujours d'actualité.
 */
async function rankCandidates(
  db: Database,
  now: Date,
  avoidMoment: string | null,
  taken: Set<string>,
  random: () => number,
  onlyOwner?: string,
): Promise<Candidate[]> {
  const { recipes, lastPublished, excluded } = await candidates(db, now, onlyOwner);
  const open = recipes.filter((r) => r.versionId && !excluded.has(r.id) && !taken.has(r.id));
  const fresh = open.filter((r) => !lastPublished.has(r.id));
  const withPhoto = async (r: (typeof open)[number]): Promise<Candidate> => ({
    id: r.id,
    ownerId: r.ownerId,
    versionId: r.versionId!,
    name: r.name,
    momentId: r.momentId,
    hasPhoto: Boolean(await currentPhoto(db, r.versionId!, "9:16")),
  });
  if (fresh.length > 0) {
    const pool = await Promise.all(shuffle(fresh, random).map(withPhoto));
    const score = (c: Candidate) =>
      (c.hasPhoto ? 0 : 2) + (avoidMoment && c.momentId === avoidMoment ? 1 : 0);
    return pool.sort((a, b) => score(a) - score(b));
  }
  // Plus de nouveautés : reprise des plus anciennes, si leur vidéo est encore valable.
  const old = open
    .filter((r) => now.getTime() - (lastPublished.get(r.id)?.getTime() ?? 0) > COOLDOWN_MS)
    .sort((a, b) => lastPublished.get(a.id)!.getTime() - lastPublished.get(b.id)!.getTime());
  const out: Candidate[] = [];
  for (const r of old) {
    if ((await latestVideo(db, r.id))?.current) out.push(await withPhoto(r));
  }
  return out;
}

/**
 * Remplit les jours de publication des 7 prochains jours qui n'ont encore rien de prévu.
 * Sans effet si la planification est désactivée ou si tout est déjà prévu.
 */
export async function planUpcoming(db: Database, deps: AutoplanDeps = {}): Promise<PlannedDay[]> {
  if (!(await getAutoplan(db)).enabled) return [];
  const now = deps.now ?? new Date();
  const random = deps.random ?? Math.random;
  const days = nextSlots("instagram", now, [], 6).filter(
    (d) => d.getTime() - now.getTime() >= MIN_LEAD_MS && d.getTime() - now.getTime() <= HORIZON_MS,
  );
  if (days.length === 0) return [];
  const existing = await db
    .select({
      at: s.scheduledPublications.scheduledAt,
      recipeId: s.scheduledPublications.recipeId,
    })
    .from(s.scheduledPublications)
    .where(
      and(
        inArray(s.scheduledPublications.status, OCCUPYING),
        gte(s.scheduledPublications.scheduledAt, new Date(now.getTime() - 3 * 24 * 3600 * 1000)),
        lte(s.scheduledPublications.scheduledAt, new Date(now.getTime() + HORIZON_MS + 24 * 3600 * 1000)),
        deps.onlyOwner ? eq(s.scheduledPublications.createdBy, deps.onlyOwner) : undefined,
      ),
    );

  const planned: PlannedDay[] = [];
  const taken = new Set<string>();
  let lastMoment: string | null = null;
  for (const day of days) {
    if (existing.some((row) => sameParisDay(row.at, day))) continue;
    const ranked = await rankCandidates(db, now, lastMoment, taken, random, deps.onlyOwner);
    let chosen: Candidate | null = null;
    let photoStarted = false;
    for (const candidate of ranked) {
      if (candidate.hasPhoto) {
        chosen = candidate;
        break;
      }
      if (
        deps.startPhoto &&
        (await deps.startPhoto(db, candidate.ownerId, candidate.id).catch(() => false))
      ) {
        chosen = candidate;
        photoStarted = true;
        break;
      }
    }
    if (!chosen) break;
    taken.add(chosen.id);
    lastMoment = chosen.momentId;

    // Vidéo et carrousel demandés à l'agent (sauf s'ils existent déjà et sont à jour).
    const [video, carousel] = await Promise.all([latestVideo(db, chosen.id), latestCarousel(db, chosen.id)]);
    if (!video?.current || !carousel?.current) {
      await queuePublication(db, chosen.ownerId, chosen.id, ["instagram", "tiktok"]);
    }
    // Page publique de la recette (lien dans les légendes proposées).
    const { ensurePublicPage } = await import("../public-recipes");
    await ensurePublicPage(db, chosen.ownerId, chosen.id);
    for (const { platform, format } of PLAN) {
      const at = slotOnDay(platform, day);
      if (!at) continue;
      await db.insert(s.scheduledPublications).values({
        recipeId: chosen.id,
        platform,
        format,
        scheduledAt: at,
        status: "proposed",
        createdBy: chosen.ownerId,
      });
    }
    await audit(db, {
      actorId: null,
      action: "publication.autoplan",
      entity: "recipe",
      entityId: chosen.id,
      after: { day: day.toISOString(), photoStarted },
    });
    planned.push({ day: day.toISOString(), recipeId: chosen.id, recipeName: chosen.name, photoStarted });
  }
  if (planned.length > 0 && deps.notify) await deps.notify(db, planned).catch(() => {});
  return planned;
}

/**
 * « Écarter cette recette » : ses propositions sont retirées, elle n'est plus proposée pendant
 * 60 jours, et le jour libéré est replanifié avec une autre recette.
 */
export async function rejectRecipe(db: Database, adminId: string, recipeId: string): Promise<boolean> {
  const rows = await db
    .update(s.scheduledPublications)
    .set({ status: "rejected", note: "Recette écartée par l'administrateur.", updatedAt: new Date() })
    .where(
      and(
        eq(s.scheduledPublications.recipeId, recipeId),
        eq(s.scheduledPublications.createdBy, adminId),
        eq(s.scheduledPublications.status, "proposed"),
      ),
    )
    .returning({ id: s.scheduledPublications.id });
  if (rows.length === 0) return false;
  await cancelPublication(db, adminId, recipeId);
  await audit(db, {
    actorId: adminId,
    action: "publication.autoplan.reject",
    entity: "recipe",
    entityId: recipeId,
  });
  return true;
}
