/** Menus et listes de courses. */
import { FakeLlmAdapter } from "@culinova/ai";
import * as s from "@culinova/db/schema";
import { and, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { emptyWizardState, type WizardState } from "@/lib/wizard";
import { createTestUser, hasTestDb, testDb } from "@/test/db";
import { savePrice } from "../costing/prices";
import { runGeneration } from "../generation/run";
import { startRecipeGeneration } from "../generation/start";
import { addMenuItem, createMenu, loadMenu, shoppingListForMenu, updateMenuItem } from "./menus";
import {
  buildShoppingNeeds,
  createShoppingList,
  deductStock,
  loadShoppingList,
  setShoppingItemChecked,
} from "./shopping";
import { addToStock, consumeStock, listStock, stockFromShoppingList } from "./stock";

const state: WizardState = {
  ...emptyWizardState("fr"),
  step: 9,
  momentCode: "main",
  influenceCode: "asia",
  regionCode: "east_asia",
  countryIso: "JP",
  cuisineCodes: ["japanese"],
  styleCode: "creative",
  mode: "idea",
  input: "Un plat de saumon",
  servings: 4,
};

/** Recette factice pour 4 (riz à sushi 300 g…), et l'identifiant de l'ingrédient riz. */
async function recipeFor(userId: string) {
  const db = testDb();
  const [draft] = await db.insert(s.recipeDrafts).values({ userId, state, wizardStep: 9 }).returning();
  const started = await startRecipeGeneration(db, { userId, draftId: draft!.id });
  if (!started.ok) throw new Error(started.reason);
  await runGeneration(db, new FakeLlmAdapter(), started.generationId);
  const [row] = await db.select().from(s.recipeDrafts).where(eq(s.recipeDrafts.id, draft!.id));
  const [rice] = await db
    .select({ ingredientId: s.recipeIngredients.ingredientId })
    .from(s.recipeIngredients)
    .innerJoin(s.recipes, eq(s.recipes.currentVersionId, s.recipeIngredients.recipeVersionId))
    .where(and(eq(s.recipes.id, row!.recipeId!), eq(s.recipeIngredients.label, "Riz à sushi")));
  return { recipeId: row!.recipeId!, riceId: rice!.ingredientId! };
}

describe.skipIf(!hasTestDb)("menus et listes de courses", () => {
  it("chiffre un menu par convive et en tire la liste de courses", async () => {
    const db = testDb();
    const user = await createTestUser();
    const { recipeId, riceId } = await recipeFor(user.id);
    await savePrice(db, { userId: user.id, ingredientId: riceId, price: "4" });

    const menuId = await createMenu(db, user.id, { name: "Dîner du samedi", guests: 8, eventDate: null });
    expect(await addMenuItem(db, user.id, menuId, { recipeId })).toBe(true);
    let menu = (await loadMenu(db, user.id, menuId))!;
    // Le plat est servi pour les 8 couverts du menu : 600 g de riz à 4 €/kg = 2,40 €.
    expect(menu.items).toMatchObject([{ recipeId, course: "main", servings: 8, costCents: 240 }]);
    expect(menu).toMatchObject({ totalCents: 240, perGuestCents: 30, complete: false });
    expect(menu.available.some((d) => d.id === recipeId)).toBe(false);

    await updateMenuItem(db, user.id, menu.items[0]!.id, { course: "main", servings: 6 });
    menu = (await loadMenu(db, user.id, menuId))!;
    expect(menu.items[0]!.costCents).toBe(180);

    const listId = (await shoppingListForMenu(db, user.id, menuId))!;
    const list = (await loadShoppingList(db, user.id, listId))!;
    const items = list.groups.flatMap((g) => g.items);
    const rice = items.find((i) => i.ingredientId === riceId)!;
    expect(rice.quantity).toEqual({ dimension: "mass", value: 450 });
    expect(rice.costCents).toBe(180);
    expect(rice.recipes).toHaveLength(1);
    expect(list.totalCents).toBe(180);
    expect(list.unpricedCount).toBe(items.length - 1);

    // Cocher un article ; une autre personne ne peut pas toucher à la liste.
    const intruder = await createTestUser();
    expect(await setShoppingItemChecked(db, intruder.id, rice.id, true)).toBe(false);
    expect(await setShoppingItemChecked(db, user.id, rice.id, true)).toBe(true);
    const after = (await loadShoppingList(db, user.id, listId))!;
    expect(after.groups.flatMap((g) => g.items).find((i) => i.id === rice.id)!.checked).toBe(true);
    expect(await loadShoppingList(db, intruder.id, listId)).toBeNull();
  });

  it("additionne les quantités d'un même ingrédient", async () => {
    const db = testDb();
    const user = await createTestUser();
    const { recipeId, riceId } = await recipeFor(user.id);
    const needs = await buildShoppingNeeds(db, user.id, [
      { recipeId, servings: 4 },
      { recipeId, servings: 2 },
    ]);
    const rice = needs.find((n) => n.ingredientId === riceId)!;
    expect(rice.quantity).toEqual({ dimension: "mass", value: 450 });
    expect(rice.sources).toEqual([{ recipeId, quantity: 450 }]);
    // Les recettes d'une autre personne sont ignorées.
    const other = await createTestUser();
    expect(await buildShoppingNeeds(db, other.id, [{ recipeId, servings: 4 }])).toEqual([]);
  });

  it("déduit le stock des courses, le remplit et le consomme", async () => {
    const db = testDb();
    const user = await createTestUser();
    const { recipeId, riceId } = await recipeFor(user.id);
    const soon = new Date(Date.now() + 2 * 86_400_000);
    expect(
      await addToStock(db, user.id, {
        ingredientId: riceId,
        quantity: { dimension: "mass", value: 200 },
        bestBefore: soon,
        min: 250,
      }),
    ).toBe(true);
    let [item] = await listStock(db, user.id);
    expect(item).toMatchObject({ quantity: { dimension: "mass", value: 200 }, low: true, expiring: "soon" });

    // 300 g nécessaires pour 4, 200 g en stock : il reste 100 g à acheter.
    const needs = await deductStock(
      db,
      user.id,
      await buildShoppingNeeds(db, user.id, [{ recipeId, servings: 4 }]),
    );
    expect(needs.find((n) => n.ingredientId === riceId)!.quantity.value).toBe(100);
    // Pour 2 personnes (150 g), le riz est couvert : il disparaît de la liste.
    const small = await deductStock(
      db,
      user.id,
      await buildShoppingNeeds(db, user.id, [{ recipeId, servings: 2 }]),
    );
    expect(small.some((n) => n.ingredientId === riceId)).toBe(false);

    // Les courses cochées rejoignent le stock.
    const listId = (await createShoppingList(db, user.id, {
      name: "Courses",
      source: "recipes",
      entries: [{ recipeId, servings: 4 }],
    }))!;
    const list = (await loadShoppingList(db, user.id, listId))!;
    const riceItem = list.groups.flatMap((g) => g.items).find((i) => i.ingredientId === riceId)!;
    await setShoppingItemChecked(db, user.id, riceItem.id, true);
    expect(await stockFromShoppingList(db, user.id, listId)).toBe(1);
    [item] = await listStock(db, user.id);
    expect(item!.quantity.value).toBe(300);
    expect(item!.low).toBe(false);

    // Préparer la recette consomme le riz, sans descendre sous zéro.
    expect(
      await consumeStock(db, user.id, [
        { ingredientId: riceId, quantity: { dimension: "mass", value: 1000 } },
      ]),
    ).toBe(1);
    [item] = await listStock(db, user.id);
    expect(item!.quantity.value).toBe(0);
  });
});
