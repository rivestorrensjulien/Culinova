/** Tickets de caisse (P8) : lecture sans garder la photo, promotions, mémoire des libellés, prix de référence. */
import { FakeLlmAdapter } from "@culinova/ai";
import * as s from "@culinova/db/schema";
import { eq } from "drizzle-orm";
import { mkdtemp, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { emptyWizardState, type WizardState, withHomeDefaults } from "@/lib/wizard";
import { createTestUser, hasTestDb, testDb } from "@/test/db";
import { runGeneration } from "../generation/run";
import { startRecipeGeneration } from "../generation/start";
import { LocalStorage } from "../images/storage";
import { listMyIngredients } from "./ingredients";
import { decideInvoiceLine, loadInvoice, scanInvoice } from "./invoices";
import { currentPrices, savePrice } from "./prices";
import { referenceNameKey, refreshReferencePrices } from "./reference-prices";

const state: WizardState = withHomeDefaults({
  ...emptyWizardState("fr"),
  momentCode: "main",
  mode: "idea",
  input: "Un plat de saumon",
  servings: 4,
});

const PNG = Uint8Array.from(
  Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
    "base64",
  ),
);

async function userWithRecipe() {
  const db = testDb();
  const user = await createTestUser();
  const [draft] = await db
    .insert(s.recipeDrafts)
    .values({ userId: user.id, state, wizardStep: 9 })
    .returning();
  const started = await startRecipeGeneration(db, { userId: user.id, draftId: draft!.id });
  if (!started.ok) throw new Error(started.reason);
  await runGeneration(db, new FakeLlmAdapter(), started.generationId);
  return user;
}

describe.skipIf(!hasTestDb)("tickets de caisse", () => {
  it("lit le ticket sans garder la photo, signale les promos et retient les libellés", async () => {
    const db = testDb();
    const user = await userWithRecipe();
    const folder = await mkdtemp(join(tmpdir(), "culinova-receipts-"));
    const storage = new LocalStorage(folder);

    const scanned = await scanInvoice(
      db,
      new FakeLlmAdapter(),
      storage,
      user.id,
      { bytes: PNG, mediaType: "image/png" },
      "fr",
      "receipt",
    );
    if (!scanned.ok) throw new Error(scanned.reason);
    // La photo n'est jamais enregistrée.
    expect(await readdir(folder, { recursive: true })).toHaveLength(0);
    const [row] = await db
      .select()
      .from(s.supplierInvoices)
      .where(eq(s.supplierInvoices.id, scanned.invoiceId));
    expect(row!.kind).toBe("receipt");
    expect(row!.fileKey).toBe("efface");

    const receipt = (await loadInvoice(db, user.id, scanned.invoiceId))!;
    expect(receipt.kind).toBe("receipt");
    expect(receipt.supplier).toBe("Supermarché test");
    const [first, second, eggs] = receipt.lines;
    expect(first!.cleanName).toBeTruthy();
    expect(first!.promo).toBe(false);
    expect(second!.promo).toBe(true);
    // Prix recalculé d'après la ligne : 3 € pour 500 g = 6 €/kg (ou 0,50 €/pièce).
    expect(["6.0000", "0.5000"]).toContain(first!.proposedPrice);
    expect(eggs!.ingredientId).toBeNull();
    expect(eggs!.newUnit).toBe("piece");
    expect(eggs!.newPrice).toBe("0.3000");

    // Article inconnu ajouté à « Mes prix » sous son nom lisible.
    expect(
      await decideInvoiceLine(db, user.id, eggs!.id, { accept: true, ingredientId: "new", price: "0,30" }),
    ).toEqual({ ok: true, price: "0.3000" });
    const mine = await listMyIngredients(db, user.id);
    const added = mine.find((i) => i.name === "Œufs fermiers test");
    expect(added).toMatchObject({ unit: "piece", price: "0.3000", priceIsOwn: true, toConfirm: false });

    // Prix en promotion : enregistré, mais marqué.
    await decideInvoiceLine(db, user.id, second!.id, {
      accept: true,
      ingredientId: second!.ingredientId!,
      price: "5",
    });
    const [promo] = await db
      .select()
      .from(s.ingredientPrices)
      .where(eq(s.ingredientPrices.ingredientId, second!.ingredientId!));
    expect(promo!.isPromo).toBe(true);
    expect(promo!.source).toBe("receipt");

    // Ticket suivant : le libellé validé désigne l'ingrédient choisi, même si l'IA se trompe.
    const [mineToo] = await db
      .insert(s.ingredients)
      .values({
        scope: "owner",
        ownerId: user.id,
        canonicalName: "Produit choisi à la main",
        referenceUnit: first!.newUnit === "piece" ? "piece" : first!.newUnit === "l" ? "ml" : "g",
      })
      .returning();
    await decideInvoiceLine(db, user.id, first!.id, { accept: true, ingredientId: mineToo!.id, price: "6" });
    const again = await scanInvoice(
      db,
      new FakeLlmAdapter(),
      null,
      user.id,
      { bytes: PNG, mediaType: "image/png" },
      "fr",
      "receipt",
    );
    if (!again.ok) throw new Error(again.reason);
    const next = (await loadInvoice(db, user.id, again.invoiceId))!;
    expect(next.lines[0]!.ingredientId).toBe(mineToo!.id);
    // Prix recalculé pour cet ingrédient d'après la ligne (3 € les 500 g ou les 6 pièces).
    expect(["6.0000", "0.5000"]).toContain(next.lines[0]!.proposedPrice);
  });

  it("prix de référence : médiane d'au moins 3 personnes, hors promos et estimations", async () => {
    const db = testDb();
    const name = `Farine test ${Date.now()}`;
    const key = referenceNameKey(name);
    const users = await Promise.all([1, 2, 3, 4].map(() => createTestUser()));
    const [ingredient] = await db
      .insert(s.ingredients)
      .values({ scope: "global", canonicalName: name, referenceUnit: "g" })
      .returning();
    const price = (
      userId: string,
      value: string,
      source: "manual" | "receipt" | "ai_estimate",
      isPromo = false,
    ) => savePrice(db, { userId, ingredientId: ingredient!.id, price: value, source, isPromo });

    await price(users[0]!.id, "1,00", "manual");
    await price(users[1]!.id, "1,40", "receipt");
    await price(users[2]!.id, "0,50", "receipt", true); // promo : ignorée
    await price(users[3]!.id, "9,00", "ai_estimate"); // estimation : ignorée
    expect(await refreshReferencePrices(db, new Date(), [key])).toBe(0);

    await price(users[2]!.id, "1,20", "manual");
    expect(await refreshReferencePrices(db, new Date(), [key])).toBe(1);
    const [reference] = await db.select().from(s.referencePrices).where(eq(s.referencePrices.nameKey, key));
    expect(reference).toMatchObject({ pricePerUnit: "1.2000", owners: 3, unit: "kg" });

    // Sans prix à elle, une autre personne reçoit le prix de référence (avant toute estimation).
    const other = await createTestUser();
    const current = (await currentPrices(db, other.id, [ingredient!.id])).get(ingredient!.id)!;
    expect(current).toMatchObject({
      price: "1.2000",
      own: false,
      estimated: false,
      community: { owners: 3 },
    });
    // Celle qui n'avait qu'une estimation de l'IA aussi.
    expect(
      (await currentPrices(db, users[3]!.id, [ingredient!.id])).get(ingredient!.id)!.community,
    ).toBeTruthy();
    // Son propre prix passe toujours avant.
    expect((await currentPrices(db, users[0]!.id, [ingredient!.id])).get(ingredient!.id)!.price).toBe(
      "1.0000",
    );
  });
});
