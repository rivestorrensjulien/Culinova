/**
 * « Mon compte » : export des données (portabilité) et suppression définitive (effacement).
 */
import type { Database } from "@culinova/db";
import {
  aiGenerations,
  appliances,
  baseRecipes,
  consentRecords,
  cookieConsents,
  costingSettings,
  favorites,
  generationParams,
  impersonationSessions,
  ingredientNutritionLinks,
  ingredientPrices,
  ingredients,
  inventoryItems,
  invitations,
  legalDocuments,
  menuItems,
  menus,
  priceAlerts,
  priceHistory,
  recipeAnalyses,
  recipeCostSnapshots,
  recipeDrafts,
  recipeImages,
  recipeIngredients,
  recipeNutrition,
  recipePricing,
  recipes,
  recipeSteps,
  recipeTranslations,
  recipeVersions,
  sessions,
  shoppingListItems,
  shoppingLists,
  socialContents,
  supplierInvoiceLines,
  supplierInvoices,
  suppliers,
  usageCounters,
  userCuisinePrefs,
  userProfiles,
  users,
} from "@culinova/db/schema";
import { and, eq, inArray, isNull, ne, or, sql } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import { audit } from "./audit";
import type { ImageStorage } from "./images/storage";

export const EXPORT_FORMAT_VERSION = 1;

/** Condition « colonne dans la liste », toujours fausse pour une liste vide. */
function within(column: AnyPgColumn, ids: string[]) {
  return ids.length > 0 ? inArray(column, ids) : sql`false`;
}

/** Toutes les données de la personne, dans un objet lisible (fichier JSON). */
export async function exportAccountData(db: Database, userId: string, now = new Date()) {
  const [profile] = await db
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
      role: users.role,
      locale: users.locale,
      unitSystem: users.unitSystem,
      theme: users.theme,
      quotaOverrides: users.quotaOverrides,
      createdAt: users.createdAt,
      lastLoginAt: users.lastLoginAt,
    })
    .from(users)
    .where(eq(users.id, userId));
  if (!profile) throw new Error("Utilisateur introuvable");

  const ownedRecipes = await db.select().from(recipes).where(eq(recipes.ownerId, userId));
  const recipeIds = ownedRecipes.map((r) => r.id);
  const versions = await db.select().from(recipeVersions).where(within(recipeVersions.recipeId, recipeIds));
  const versionIds = versions.map((v) => v.id);
  const byVersion = <T extends { recipeVersionId: string }>(rows: T[], versionId: string) =>
    rows.filter((row) => row.recipeVersionId === versionId);

  const [lines, steps, translations, images, pricing, nutrition, social, analyses, snapshots, bases] =
    await Promise.all([
      db.select().from(recipeIngredients).where(within(recipeIngredients.recipeVersionId, versionIds)),
      db.select().from(recipeSteps).where(within(recipeSteps.recipeVersionId, versionIds)),
      db.select().from(recipeTranslations).where(within(recipeTranslations.recipeVersionId, versionIds)),
      db
        .select({
          id: recipeImages.id,
          recipeVersionId: recipeImages.recipeVersionId,
          format: recipeImages.format,
          width: recipeImages.width,
          height: recipeImages.height,
          prompt: recipeImages.prompt,
          status: recipeImages.status,
          createdAt: recipeImages.createdAt,
        })
        .from(recipeImages)
        .where(within(recipeImages.recipeVersionId, versionIds)),
      db.select().from(recipePricing).where(within(recipePricing.recipeVersionId, versionIds)),
      db.select().from(recipeNutrition).where(within(recipeNutrition.recipeVersionId, versionIds)),
      db.select().from(socialContents).where(within(socialContents.recipeVersionId, versionIds)),
      db.select().from(recipeAnalyses).where(within(recipeAnalyses.recipeVersionId, versionIds)),
      db.select().from(recipeCostSnapshots).where(within(recipeCostSnapshots.recipeVersionId, versionIds)),
      db.select().from(baseRecipes).where(within(baseRecipes.recipeId, recipeIds)),
    ]);

  const ownIngredients = await db.select().from(ingredients).where(eq(ingredients.ownerId, userId));
  const invoices = await db.select().from(supplierInvoices).where(eq(supplierInvoices.ownerId, userId));
  const ownMenus = await db.select().from(menus).where(eq(menus.ownerId, userId));
  const lists = await db.select().from(shoppingLists).where(eq(shoppingLists.ownerId, userId));

  const [
    prices,
    history,
    ownSuppliers,
    invoiceLines,
    alerts,
    ownAppliances,
    costing,
    nutritionLinks,
    menuLines,
    listItems,
    inventory,
    favoriteRows,
    drafts,
    cuisinePrefs,
    culinaryProfile,
    consents,
    cookies,
    usage,
    generations,
    sessionRows,
  ] = await Promise.all([
    db.select().from(ingredientPrices).where(eq(ingredientPrices.ownerId, userId)),
    db.select().from(priceHistory).where(eq(priceHistory.ownerId, userId)),
    db.select().from(suppliers).where(eq(suppliers.ownerId, userId)),
    db
      .select()
      .from(supplierInvoiceLines)
      .where(
        within(
          supplierInvoiceLines.supplierInvoiceId,
          invoices.map((i) => i.id),
        ),
      ),
    db.select().from(priceAlerts).where(eq(priceAlerts.ownerId, userId)),
    db.select().from(appliances).where(eq(appliances.ownerId, userId)),
    db.select().from(costingSettings).where(eq(costingSettings.ownerId, userId)),
    db.select().from(ingredientNutritionLinks).where(eq(ingredientNutritionLinks.ownerId, userId)),
    db
      .select()
      .from(menuItems)
      .where(
        within(
          menuItems.menuId,
          ownMenus.map((m) => m.id),
        ),
      ),
    db
      .select()
      .from(shoppingListItems)
      .where(
        within(
          shoppingListItems.shoppingListId,
          lists.map((l) => l.id),
        ),
      ),
    db.select().from(inventoryItems).where(eq(inventoryItems.ownerId, userId)),
    db.select().from(favorites).where(eq(favorites.userId, userId)),
    db.select().from(recipeDrafts).where(eq(recipeDrafts.userId, userId)),
    db.select().from(userCuisinePrefs).where(eq(userCuisinePrefs.userId, userId)),
    db.select().from(userProfiles).where(eq(userProfiles.userId, userId)),
    db
      .select({
        document: legalDocuments.title,
        type: consentRecords.consentType,
        version: legalDocuments.version,
        granted: consentRecords.granted,
        context: consentRecords.context,
        at: consentRecords.at,
        ip: consentRecords.ip,
        userAgent: consentRecords.userAgent,
      })
      .from(consentRecords)
      .innerJoin(legalDocuments, eq(legalDocuments.id, consentRecords.legalDocumentId))
      .where(eq(consentRecords.userId, userId)),
    db.select().from(cookieConsents).where(eq(cookieConsents.userId, userId)),
    db
      .select({ metric: usageCounters.metric, period: usageCounters.period, count: usageCounters.count })
      .from(usageCounters)
      .where(and(eq(usageCounters.subjectType, "user"), eq(usageCounters.subjectId, userId))),
    db
      .select({
        kind: aiGenerations.kind,
        status: aiGenerations.status,
        model: aiGenerations.model,
        promptVersion: aiGenerations.promptVersion,
        instruction: aiGenerations.instruction,
        createdAt: aiGenerations.createdAt,
      })
      .from(aiGenerations)
      .where(eq(aiGenerations.userId, userId)),
    db
      .select({
        createdAt: sessions.createdAt,
        expiresAt: sessions.expiresAt,
        ipAddress: sessions.ipAddress,
        userAgent: sessions.userAgent,
      })
      .from(sessions)
      .where(eq(sessions.userId, userId)),
  ]);

  return {
    format: "culinova-export",
    formatVersion: EXPORT_FORMAT_VERSION,
    exportedAt: now.toISOString(),
    units: "Grammes, millilitres, °C, secondes ; montants en centimes (*_cents) ; prix au kilo en euros.",
    profile,
    culinaryProfile: culinaryProfile[0] ?? null,
    cuisinePreferences: cuisinePrefs,
    recipes: ownedRecipes.map((recipe) => ({
      ...recipe,
      base: bases.find((b) => b.recipeId === recipe.id) ?? null,
      favorite: favoriteRows.some((f) => f.recipeId === recipe.id),
      versions: versions
        .filter((v) => v.recipeId === recipe.id)
        .map((version) => ({
          ...version,
          ingredients: byVersion(lines, version.id),
          steps: byVersion(steps, version.id),
          translations: byVersion(translations, version.id),
          images: byVersion(images, version.id).map((image) => ({
            ...image,
            download: `/api/images/${image.id}?telecharger=1`,
          })),
          pricing: byVersion(pricing, version.id),
          nutrition: byVersion(nutrition, version.id),
          socialContents: byVersion(social, version.id),
          analyses: byVersion(analyses, version.id),
          costSnapshots: byVersion(snapshots, version.id),
        })),
    })),
    drafts,
    ingredients: ownIngredients,
    ingredientPrices: prices,
    priceHistory: history,
    suppliers: ownSuppliers,
    supplierInvoices: invoices.map((invoice) => ({
      ...invoice,
      lines: invoiceLines.filter((l) => l.supplierInvoiceId === invoice.id),
    })),
    priceAlerts: alerts,
    nutritionLinks,
    costingSettings: costing[0] ?? null,
    appliances: ownAppliances,
    menus: ownMenus.map((menu) => ({ ...menu, items: menuLines.filter((i) => i.menuId === menu.id) })),
    shoppingLists: lists.map((list) => ({
      ...list,
      items: listItems.filter((i) => i.shoppingListId === list.id),
    })),
    inventory,
    usage,
    aiGenerations: generations,
    consents,
    cookieConsents: cookies,
    sessions: sessionRows,
  };
}

type DeleteAccountFailure = { ok: false; reason: "not_found" | "last_admin" };
export type DeleteAccountResult = { ok: true; images: number } | DeleteAccountFailure;

/**
 * Supprime définitivement le compte et tout ce qui lui appartient. Sont conservés,
 * sans lien avec la personne : le coût des générations (budget IA) et le journal d'audit.
 * Le code d'invitation est révoqué pour ne pas redevenir utilisable.
 */
export async function deleteAccount(
  db: Database,
  userId: string,
  ctx: { ip?: string | null; userAgent?: string | null; storage?: ImageStorage | null },
): Promise<DeleteAccountResult> {
  const result = await db.transaction(async (tx) => {
    const [user] = await tx
      .select({ role: users.role })
      .from(users)
      .where(eq(users.id, userId))
      .for("update");
    if (!user) return { ok: false as const, reason: "not_found" as const };
    if (user.role === "admin") {
      const [others] = await tx
        .select({ n: sql<number>`count(*)::int` })
        .from(users)
        .where(and(eq(users.role, "admin"), ne(users.id, userId), eq(users.banned, false)));
      if (!others?.n) return { ok: false as const, reason: "last_admin" as const };
    }

    const recipeIds = (
      await tx.select({ id: recipes.id }).from(recipes).where(eq(recipes.ownerId, userId))
    ).map((r) => r.id);
    const versions = await tx
      .select({ id: recipeVersions.id, paramsId: recipeVersions.generationParamsId })
      .from(recipeVersions)
      .where(within(recipeVersions.recipeId, recipeIds));
    const keys = (
      await tx
        .select({ key: recipeImages.storageKey })
        .from(recipeImages)
        .where(
          within(
            recipeImages.recipeVersionId,
            versions.map((v) => v.id),
          ),
        )
    ).flatMap((row) => (row.key ? [row.key] : []));
    const generationRows = await tx
      .select({ paramsId: aiGenerations.generationParamsId })
      .from(aiGenerations)
      .where(eq(aiGenerations.userId, userId));
    const paramsIds = [
      ...new Set([...versions, ...generationRows].flatMap((row) => (row.paramsId ? [row.paramsId] : []))),
    ];

    // Coûts IA gardés pour le suivi du budget, sans contenu ni lien avec la personne.
    await tx
      .update(aiGenerations)
      .set({
        userId: null,
        inputRef: null,
        draftId: null,
        recipeId: null,
        generationParamsId: null,
        instruction: null,
        output: null,
        error: null,
      })
      .where(eq(aiGenerations.userId, userId));
    await tx
      .delete(usageCounters)
      .where(
        or(
          and(eq(usageCounters.subjectType, "user"), eq(usageCounters.subjectId, userId)),
          and(eq(usageCounters.subjectType, "recipe"), within(usageCounters.subjectId, recipeIds)),
        ),
      );
    // Le code d'invitation ne doit pas redevenir disponible ; ses données personnelles sont effacées.
    await tx
      .update(invitations)
      .set({
        revokedAt: sql`coalesce(${invitations.revokedAt}, now())`,
        email: null,
        reservedEmail: null,
        reservedName: null,
        reservedConsents: null,
      })
      .where(eq(invitations.redeemedBy, userId));
    await tx
      .update(impersonationSessions)
      .set({ endedAt: new Date() })
      .where(and(eq(impersonationSessions.userId, userId), isNull(impersonationSessions.endedAt)));

    await audit(tx, {
      actorId: userId,
      action: "account.delete",
      entity: "user",
      entityId: userId,
      after: { recipes: recipeIds.length, images: keys.length },
      ip: ctx.ip ?? null,
      userAgent: ctx.userAgent ?? null,
    });
    // Tout le reste (recettes, versions, photos, prix, réglages, sessions…) suit en cascade.
    await tx.delete(users).where(eq(users.id, userId));
    if (paramsIds.length > 0)
      await tx.delete(generationParams).where(inArray(generationParams.id, paramsIds));
    return { ok: true as const, keys };
  });

  if (!result.ok) return result;
  // Fichiers des photos : après la suppression en base (un échec ne bloque pas l'effacement).
  if (ctx.storage && result.keys.length > 0) {
    await ctx.storage.remove(result.keys).catch((error: unknown) => {
      console.error("Suppression des photos incomplète", error);
    });
  }
  return { ok: true, images: result.keys.length };
}
