import { cuisines, userCuisinePrefs } from "@culinova/db/schema";
import { and, desc, eq } from "drizzle-orm";
import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { parseWizardState } from "@/lib/wizard";
import { getDb } from "@/server/db";
import { getOrCreateDraft } from "@/server/generation/drafts";
import { loadCulinaryReference } from "@/server/generation/reference";
import { loadRecipeView } from "@/server/generation/view";
import { getMonthlyUsage } from "@/server/quotas";
import { requireUser } from "@/server/session";
import { Wizard } from "./wizard";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  return { title: (await getTranslations({ locale, namespace: "Wizard" }))("title") };
}

/** Wizard de création : reprend automatiquement le brouillon en cours. */
// Sans Inngest, la génération lancée depuis cette page s'exécute après la réponse :
// on lui laisse jusqu'à 5 minutes (limite de Vercel).
export const maxDuration = 300;

export default async function CreatePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const session = await requireUser(locale);
  const db = getDb();
  const language = session.user.locale === "en" ? "en" : "fr";
  const draft = await getOrCreateDraft(db, session.user.id, language);

  const [reference, usage, prefs, recipe] = await Promise.all([
    loadCulinaryReference(db, locale),
    getMonthlyUsage(db, session.user.id),
    db
      .select({ code: cuisines.code, kind: userCuisinePrefs.kind })
      .from(userCuisinePrefs)
      .innerJoin(cuisines, eq(cuisines.id, userCuisinePrefs.cuisineId))
      .where(and(eq(userCuisinePrefs.userId, session.user.id)))
      .orderBy(desc(userCuisinePrefs.usedAt))
      .limit(30),
    draft.status === "done" && draft.recipeId ? loadRecipeView(db, draft.recipeId, session.user.id) : null,
  ]);

  return (
    <Wizard
      key={draft.id}
      draft={{
        id: draft.id,
        status: draft.status,
        error: draft.error,
        state: parseWizardState(draft.state, language),
        clientUpdatedAt: draft.clientUpdatedAt?.toISOString() ?? null,
        recipeId: draft.recipeId,
      }}
      reference={reference}
      favorites={prefs.filter((p) => p.kind === "favorite").map((p) => p.code)}
      recents={prefs
        .filter((p) => p.kind === "recent")
        .map((p) => p.code)
        .slice(0, 8)}
      usage={{ used: usage.used.recipes, limit: usage.limits.recipes }}
      initialRecipe={recipe}
    />
  );
}
