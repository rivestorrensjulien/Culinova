/**
 * Compteurs de quotas en base. La logique (périodes, limites) vit dans @culinova/core ;
 * ici, uniquement la lecture et l'incrément atomique des compteurs.
 */
import {
  checkQuota,
  monthlyPeriod,
  nextResetDate,
  parseQuotaOverrides,
  periodFor,
  type QuotaLimits,
  type QuotaMetric,
  resolveQuotaLimits,
} from "@culinova/core";
import type { Database } from "@culinova/db";
import {
  aiBudgets,
  SETTING_KEYS,
  siteSettings,
  subscriptionPlans,
  usageCounters,
  users,
} from "@culinova/db/schema";
import { and, eq, inArray, sql } from "drizzle-orm";

/** Limites effectives d'une personne : défauts (admin) → offre → exceptions personnelles. */
export async function getQuotaLimits(db: Database, userId: string): Promise<QuotaLimits> {
  const [user] = await db
    .select({ role: users.role, overrides: users.quotaOverrides })
    .from(users)
    .where(eq(users.id, userId));
  if (!user) throw new Error("Utilisateur introuvable");
  // Les administrateurs ne sont pas limités.
  if (user.role === "admin") return { recipes: null, images: null, regenerations: null };

  const [defaults] = await db
    .select({ value: siteSettings.value })
    .from(siteSettings)
    .where(eq(siteSettings.key, SETTING_KEYS.defaultQuotas));
  const [plan] = await db
    .select({ quotas: subscriptionPlans.quotas })
    .from(subscriptionPlans)
    .where(eq(subscriptionPlans.code, "invitation"));

  return resolveQuotaLimits(
    parseQuotaOverrides(defaults?.value),
    parseQuotaOverrides(plan?.quotas),
    parseQuotaOverrides(user.overrides),
  );
}

export interface MonthlyUsage {
  period: string;
  used: { recipes: number; images: number };
  limits: QuotaLimits;
  resetsOn: { year: number; month: number; day: 1 };
}

/** Consommation du mois en cours, pour l'affichage du solde. */
export async function getMonthlyUsage(db: Database, userId: string, now = new Date()): Promise<MonthlyUsage> {
  const period = monthlyPeriod(now);
  const rows = await db
    .select({ metric: usageCounters.metric, count: usageCounters.count })
    .from(usageCounters)
    .where(
      and(
        eq(usageCounters.subjectType, "user"),
        eq(usageCounters.subjectId, userId),
        eq(usageCounters.period, period),
        inArray(usageCounters.metric, ["recipes", "images"]),
      ),
    );
  const used = { recipes: 0, images: 0 };
  for (const row of rows) used[row.metric as "recipes" | "images"] = row.count;
  return { period, used, limits: await getQuotaLimits(db, userId), resetsOn: nextResetDate(now) };
}

export interface ConsumeResult {
  allowed: boolean;
  /** Nouvelle valeur du compteur si l'opération est acceptée. */
  count: number | null;
  limit: number | null;
}

/**
 * Consomme du quota de façon atomique : deux demandes simultanées ne peuvent
 * jamais dépasser la limite (l'incrément et la vérification sont une seule requête).
 */
export async function consumeQuota(
  db: Database,
  input: {
    userId: string;
    metric: QuotaMetric;
    /** Recette concernée, pour les régénérations (comptées par recette). */
    recipeId?: string;
    amount?: number;
    now?: Date;
  },
): Promise<ConsumeResult> {
  const amount = input.amount ?? 1;
  const limits = await getQuotaLimits(db, input.userId);
  const limit = limits[input.metric];
  const perRecipe = input.metric === "regenerations";
  if (perRecipe && !input.recipeId) throw new Error("recipeId est requis pour les régénérations");
  if (!checkQuota(0, limit, amount).allowed) return { allowed: false, count: null, limit };

  const subjectType = perRecipe ? "recipe" : "user";
  const subjectId = perRecipe ? input.recipeId! : input.userId;
  const period = periodFor(input.metric, input.now ?? new Date());

  const result = await db.execute<{ count: number }>(sql`
    insert into usage_counters (subject_type, subject_id, metric, period, count)
    values (${subjectType}, ${subjectId}, ${input.metric}, ${period}, ${amount})
    on conflict (subject_type, subject_id, metric, period) do update
      set count = usage_counters.count + excluded.count, updated_at = now()
      ${limit === null ? sql`` : sql`where usage_counters.count + excluded.count <= ${limit}`}
    returning count
  `);
  const row = result[0];
  return row ? { allowed: true, count: row.count, limit } : { allowed: false, count: null, limit };
}

/** Rend du quota (ex. génération échouée), sans jamais descendre sous zéro. */
export async function releaseQuota(
  db: Database,
  input: { userId: string; metric: QuotaMetric; recipeId?: string; amount?: number; now?: Date },
): Promise<void> {
  const perRecipe = input.metric === "regenerations";
  await db
    .update(usageCounters)
    .set({ count: sql`greatest(${usageCounters.count} - ${input.amount ?? 1}, 0)` })
    .where(
      and(
        eq(usageCounters.subjectType, perRecipe ? "recipe" : "user"),
        eq(usageCounters.subjectId, perRecipe ? input.recipeId! : input.userId),
        eq(usageCounters.metric, input.metric),
        eq(usageCounters.period, periodFor(input.metric, input.now ?? new Date())),
      ),
    );
}

/** Plafond de budget IA du mois (en micro-dollars), null = pas de plafond. */
export async function getAiBudgetCap(db: Database): Promise<number | null> {
  const [row] = await db
    .select({ value: siteSettings.value })
    .from(siteSettings)
    .where(eq(siteSettings.key, SETTING_KEYS.monthlyAiBudget));
  const cap = (row?.value as { capUsdMicros?: unknown } | undefined)?.capUsdMicros;
  return typeof cap === "number" && Number.isInteger(cap) && cap >= 0 ? cap : null;
}

/** Ajoute une dépense IA au budget global du mois. */
export async function recordAiSpend(db: Database, usdMicros: number, now = new Date()): Promise<number> {
  const period = monthlyPeriod(now);
  const [row] = await db
    .insert(aiBudgets)
    .values({ period, spentUsdMicros: usdMicros })
    .onConflictDoUpdate({
      target: aiBudgets.period,
      set: { spentUsdMicros: sql`${aiBudgets.spentUsdMicros} + ${usdMicros}`, updatedAt: new Date() },
    })
    .returning({ spent: aiBudgets.spentUsdMicros });
  return row!.spent;
}

export async function getAiSpend(db: Database, now = new Date()): Promise<number> {
  const [row] = await db
    .select({ spent: aiBudgets.spentUsdMicros })
    .from(aiBudgets)
    .where(eq(aiBudgets.period, monthlyPeriod(now)));
  return row?.spent ?? 0;
}
